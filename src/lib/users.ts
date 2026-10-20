import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';

import { apiGet } from '@/lib/api';

const UserSchema = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string(),
  company: z.object({ name: z.string() }),
});

export type User = z.infer<typeof UserSchema>;

export const userKeys = {
  all: ['users'] as const,
  detail: (id: number) => [...userKeys.all, id] as const,
};

export function useUsers() {
  return useQuery({
    queryKey: userKeys.all,
    queryFn: ({ signal }) => apiGet('/users', z.array(UserSchema), signal),
  });
}

export function useUser(id: number) {
  return useQuery({
    queryKey: userKeys.detail(id),
    queryFn: ({ signal }) => apiGet(`/users/${id}`, UserSchema, signal),
    enabled: Number.isInteger(id),
  });
}
