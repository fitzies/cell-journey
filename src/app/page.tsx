import { redirect } from "next/navigation";

// Temporary: redirect all users to sign-in until auth is implemented
export default function RootPage() {
  redirect("/sign-in");
}
