import { redirect } from "next/navigation";

export default function AdminApplicationsPortalPage() {
  redirect("/applications?portal=admin");
}
