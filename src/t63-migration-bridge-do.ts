export class AdminAuthLock {
  constructor(_ctx: unknown, _env: unknown) {}
  async fetch() { return new Response("inactive", { status: 404 }); }
}

export class AdminUploadCoordinator {
  constructor(_ctx: unknown, _env: unknown) {}
  async fetch() { return new Response("inactive", { status: 404 }); }
}
