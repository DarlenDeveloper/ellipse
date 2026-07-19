import { redirect } from "next/navigation";

export default function RootPage() {
  // Entry point → auth. Once authenticated, users land on /dashboard.
  redirect("/login");
}
