import * as z from "zod";

export const roleEnum = z.enum([
    'super_admin',
    'admin',
    'warden',
    'committe',
    'student',
]);

export type Role = z.infer<typeof roleEnum>;

export const userCreateSchema = z.object({
    name: z.string().min(1),
    age: z.number().int().nonnegative(),
    email: z.string().email(),
    role: roleEnum.optional().default('student'),
});

export const userResponseSchema = z.object({
    id: z.number().int(),
    name: z.string(),
    age: z.number().int(),
    email: z.string().email(),
    role: roleEnum,
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
});

export type UserCreateInput = z.infer<typeof userCreateSchema>;
export type UserResponse = z.infer<typeof userResponseSchema>;
