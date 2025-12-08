
import { useUser } from "@clerk/nextjs";

export type UserRole = 'student' | 'admin' | 'snr_admin' | 'super_admin' | 'committee';

export function useRole() {
    const { user, isLoaded } = useUser();
    const role = (user?.publicMetadata?.role as UserRole) || 'student';
    return { role, isLoaded, user };
}
