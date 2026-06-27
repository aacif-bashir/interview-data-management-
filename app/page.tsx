import { getFolderTree } from "@/firebase-services/folders";
import { Workspace } from "@/components/workspace/Workspace";

// Always render fresh — folders/questions change frequently and this is a
// single-user tool where the data should reflect the latest writes.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  // Initial folder tree is fetched on the server for a fast first paint.
  const tree = await getFolderTree();
  return <Workspace initialTree={tree} />;
}
