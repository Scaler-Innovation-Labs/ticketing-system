
export interface PageParams {
    params: { [key: string]: string };
    searchParams: { [key: string]: string | string[] | undefined };
}

export type Role = 'student' | 'admin' | 'super_admin' | 'committee' | 'snr_admin';
