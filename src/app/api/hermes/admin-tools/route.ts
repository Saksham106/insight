import { handleHermesToolPost } from "@/app/api/hermes/tools/route";

export async function POST(request: Request) {
  return handleHermesToolPost(request, "imessage_admin");
}
