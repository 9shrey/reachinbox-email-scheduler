import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { DashboardClient } from "./DashboardClient";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <DashboardClient
      name={session.user.name}
      email={session.user.email}
      image={session.user.image}
    />
  );
}
