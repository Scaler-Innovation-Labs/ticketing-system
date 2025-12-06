
import { useUser } from "@clerk/nextjs";

export function useRole() {
    const { user, isLoaded } = useUser();
    const role = (user?.publicMetadata?.role as string) || 'student';
    return { role, isLoaded, user };
}
