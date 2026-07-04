import { getFolderTree } from "@/firebase-services/folders";
import { Workspace } from "@/components/workspace/Workspace";
import { cookies } from "next/headers";
import { verifySessionCookie, getUserRecord, SESSION_COOKIE } from "@/firebase-services/auth";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE)?.value;
  const decoded = await verifySessionCookie(sessionCookie);
  const user = decoded ? await getUserRecord(decoded.uid) : null;
  const userRole = user?.role ?? "viewer";

  const tree = await getFolderTree();
  // Using mode="settings" would ideally show settings instead of question lists, 
  // but we fallback to Workspace for now to keep the layout consistent.
  return (
    <Workspace initialTree={tree} userRole={userRole} user={user} />
  );
}
