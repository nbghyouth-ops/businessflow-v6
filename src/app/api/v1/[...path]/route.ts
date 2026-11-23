import type { NextRequest } from "next/server";
import { dispatch } from "@/server/core";
import { routes } from "@/server/routes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

type Ctx = { params: Promise<{ path: string[] }> };
const handle = async (req: NextRequest, { params }: Ctx) => dispatch(routes, req, (await params).path);

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;
