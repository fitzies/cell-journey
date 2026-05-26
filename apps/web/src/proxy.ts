import { convexAuthNextjsMiddleware } from "@convex-dev/auth/nextjs/server";
import type { NextFetchEvent, NextRequest } from "next/server";

const convexAuthProxy = convexAuthNextjsMiddleware();

export function proxy(request: NextRequest, event: NextFetchEvent) {
  return convexAuthProxy(request, event);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
