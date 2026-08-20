import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { UserProvider } from "@/context/UserContext";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <UserProvider
      user={{ name: session.user.name, email: session.user.email, image: session.user.image }}
    >
      {children}
    </UserProvider>
  );
}
