const PUBLIC_DIR = new URL("./public/", import.meta.url);
const DATA_DIR = new URL("./data/projects/", import.meta.url);

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js":   "application/javascript",
  ".css":  "text/css",
  ".stl":  "application/octet-stream",
  ".obj":  "application/octet-stream",
  ".json": "application/json",
  ".svg":  "image/svg+xml",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".wasm": "application/wasm",
};

// Ensure data dir exists
try { await Deno.mkdir(DATA_DIR, { recursive: true }); } catch { /* ok */ }

// ===== UTILITY =====
function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 4096;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += CHUNK) {
    parts.push(String.fromCharCode(...bytes.slice(i, i + CHUNK)));
  }
  return btoa(parts.join(""));
}

// ===== API HANDLERS =====

async function apiListProjects(): Promise<Response> {
  const projects = [];
  try {
    for await (const entry of Deno.readDir(DATA_DIR)) {
      if (!entry.isDirectory) continue;
      const jsonPath = new URL(`./${entry.name}/project.json`, DATA_DIR);
      try {
        const raw = await Deno.readTextFile(jsonPath);
        const p = JSON.parse(raw);
        projects.push({
          id: entry.name,
          name: p.name || "Untitled",
          savedAt: p.savedAt || "",
          originalFilename: p.originalFilename || "",
        });
      } catch { /* skip corrupt projects */ }
    }
  } catch { /* dir may not exist */ }
  projects.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  return new Response(JSON.stringify(projects), {
    headers: { "Content-Type": "application/json" },
  });
}

async function apiGetProject(id: string): Promise<Response> {
  const projDir = new URL(`./${id}/`, DATA_DIR);
  try {
    const raw = await Deno.readTextFile(new URL("./project.json", projDir));
    const project = JSON.parse(raw);
    // Load STL and inline as base64
    try {
      const stlBytes = await Deno.readFile(new URL("./model.stl", projDir));
      project.geometryStlBase64 = bytesToBase64(stlBytes);
    } catch { /* model.stl may be missing */ }
    project.id = id;
    return new Response(JSON.stringify(project), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) {
      return new Response(JSON.stringify({ error: "Project not found" }), {
        status: 404, headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ error: "Server error" }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
}

async function apiSaveProject(body: string): Promise<Response> {
  let project;
  try { project = JSON.parse(body); } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400, headers: { "Content-Type": "application/json" },
    });
  }

  const id = project.id || crypto.randomUUID();
  const projDir = new URL(`./${id}/`, DATA_DIR);
  await Deno.mkdir(projDir, { recursive: true });

  // Write model.stl
  if (project.geometryStlBase64) {
    const stlBytes = Uint8Array.from(atob(project.geometryStlBase64), c => c.charCodeAt(0));
    await Deno.writeFile(new URL("./model.stl", projDir), stlBytes);
  }

  // Write project.json (without the STL payload)
  const { geometryStlBase64, id: _id, ...meta } = project;
  meta.savedAt = new Date().toISOString();
  meta.version = 1;
  await Deno.writeTextFile(
    new URL("./project.json", projDir),
    JSON.stringify(meta, null, 2),
  );

  return new Response(JSON.stringify({ id, ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
}

async function apiDeleteProject(id: string): Promise<Response> {
  const projDir = new URL(`./${id}/`, DATA_DIR);
  try {
    await Deno.remove(projDir, { recursive: true });
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) {
      return new Response(JSON.stringify({ error: "Project not found" }), {
        status: 404, headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ error: "Server error" }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
}

async function handleApi(req: Request, url: URL): Promise<Response> {
  const path = url.pathname;

  // GET /api/projects — list all
  if (path === "/api/projects" && req.method === "GET") {
    return apiListProjects();
  }

  // POST /api/projects — save
  if (path === "/api/projects" && req.method === "POST") {
    return apiSaveProject(await req.text());
  }

  // GET /api/projects/:id
  const getMatch = path.match(/^\/api\/projects\/([^\/]+)$/);
  if (getMatch && req.method === "GET") {
    return apiGetProject(getMatch[1]);
  }

  // DELETE /api/projects/:id
  if (getMatch && req.method === "DELETE") {
    return apiDeleteProject(getMatch[1]);
  }

  return new Response(JSON.stringify({ error: "Not found" }), {
    status: 404, headers: { "Content-Type": "application/json" },
  });
}

// ===== MAIN HANDLER =====

async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);

  // API routes
  if (url.pathname.startsWith("/api/")) {
    return handleApi(req, url);
  }

  // Static file serving
  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;

  if (pathname.includes("..")) {
    return new Response("Forbidden", { status: 403 });
  }

  const fileUrl = new URL(`.${pathname}`, PUBLIC_DIR);

  try {
    const data = await Deno.readFile(fileUrl);
    const ext = pathname.slice(pathname.lastIndexOf("."));
    const contentType = MIME[ext] || "application/octet-stream";
    return new Response(data, { headers: { "Content-Type": contentType } });
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) {
      return new Response("Not Found", { status: 404 });
    }
    return new Response("Internal Server Error", { status: 500 });
  }
}

console.log("3D Object Remixer running at http://localhost:8000");
Deno.serve({ port: 8000, hostname: "0.0.0.0" }, handler);
