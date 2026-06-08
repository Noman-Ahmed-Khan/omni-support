export interface UpdateUserProfileDto {
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
  phone?: string;
  timezone?: string;
  locale?: string;
}

export interface ChangeUserRoleDto {
  role: string;
}

export interface ListUsersQueryDto {
  page?: string;
  limit?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  role?: string | string[];
  status?: string | string[];
  search?: string;
}
