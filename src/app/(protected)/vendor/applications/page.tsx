import { redirect } from "next/navigation";

export default function VendorApplicationsPortalPage() {
  redirect("/applications?portal=vendor");
}
