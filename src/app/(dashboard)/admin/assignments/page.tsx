import { permanentRedirect } from "next/navigation";

// The Groups tab merged into Chats — every conversation is now managed in one
// place. Kept as a redirect so existing links and bookmarks still resolve.
export default function AdminAssignmentsPage() {
  permanentRedirect("/admin/chats");
}
