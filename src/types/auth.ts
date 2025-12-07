import { USER_ROLES, type UserRole as UserRoleType } from "@/conf/constants";

export type UserRole = UserRoleType;

export function getDashboardPath(role: UserRole): string {
    switch (role) {
        case USER_ROLES.SUPER_ADMIN:
            return "/superadmin/dashboard";
        case USER_ROLES.SNR_ADMIN:
            return "/snr-admin/dashboard";
        case USER_ROLES.ADMIN:
            return "/admin/dashboard";
        case USER_ROLES.COMMITTEE:
            return "/committee/dashboard";
        case USER_ROLES.STUDENT:
        default:
            return "/student/dashboard";
    }
}
