import { getFolderTree } from "@/firebase-services/folders";
import { Workspace } from "@/components/workspace/Workspace";
import { cookies } from "next/headers";
import { verifySessionCookie, getUserRecord, SESSION_COOKIE } from "@/firebase-services/auth";

// Always render fresh — folders/questions change frequently and this is a
// single-user tool where the data should reflect the latest writes.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE)?.value;
  const decoded = await verifySessionCookie(sessionCookie);
  const user = decoded ? await getUserRecord(decoded.uid) : null;
  const userRole = user?.role ?? "viewer";

  // Initial folder tree is fetched on the server for a fast first paint.
  const tree = await getFolderTree();
  return <Workspace initialTree={tree} userRole={userRole} user={user} />;
}
