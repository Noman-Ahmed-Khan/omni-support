import type { Request, Response, NextFunction } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';

import type { UserService } from '../../../application/user/services/user.service';
import type { UserEntity } from '../../../domain/user/entities/user.entity';
import { successResponse, paginatedResponse } from '../dtos/common/response.dto';
import type {
  UpdateUserProfileDto,
  ChangeUserRoleDto,
  ListUsersQueryDto,
} from '../dtos/user/user.dto';

export class UserController {
  constructor(private readonly userService: UserService) {}

  async getMe(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = await this.userService.getUser(req.user!.id, req.tenantId);
      res.status(200).json(successResponse(this.toUserResponse(user)));
    } catch (error) {
      next(error);
    }
  }

  async updateMe(
    req: Request<ParamsDictionary, unknown, UpdateUserProfileDto, unknown>,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const updated = await this.userService.updateProfile({
        userId: req.user!.id,
        tenantId: req.tenantId,
        ...req.body,
      });

      res.status(200).json(successResponse(this.toUserResponse(updated)));
    } catch (error) {
      next(error);
    }
  }

  async findOne(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = await this.userService.getUser(req.params.id, req.tenantId);
      res.status(200).json(successResponse(this.toUserResponse(user)));
    } catch (error) {
      next(error);
    }
  }

  async findAll(
    req: Request<ParamsDictionary, unknown, unknown, ListUsersQueryDto>,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { page, limit, sortBy, sortOrder, role, status, search } = req.query;

      const result = await this.userService.listUsers(
        { tenantId: req.tenantId, role, status, search },
        { page: Number(page ?? 1), limit: Number(limit ?? 20), sortBy, sortOrder },
      );

      res.status(200).json(
        paginatedResponse(
          result.data.map((user) => this.toUserResponse(user)),
          result.total,
          result.page,
          result.limit,
        ),
      );
    } catch (error) {
      next(error);
    }
  }

  async changeRole(
    req: Request<ParamsDictionary, unknown, ChangeUserRoleDto, unknown>,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const updated = await this.userService.changeRole({
        userId: req.user!.id,
        targetUserId: req.params.id,
        tenantId: req.tenantId,
        newRole: req.body.role,
        actorRole: req.user!.role,
      });

      res.status(200).json(successResponse(this.toUserResponse(updated)));
    } catch (error) {
      next(error);
    }
  }

  private toUserResponse(user: UserEntity): Record<string, unknown> {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      fullName: user.fullName,
      role: user.role,
      status: user.status,
      tenantId: user.tenantId,
      avatarUrl: user.avatarUrl,
      phone: user.phone,
      timezone: user.timezone,
      locale: user.locale,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
