import { Request, Response, NextFunction, RequestHandler } from 'express';
import { ParamsDictionary } from 'express-serve-static-core';
import { ZodError, ZodTypeAny, z } from 'zod';
import { ValidationError } from '../../../shared/errors/domain.error';

type ValidationTarget = 'body' | 'query' | 'params';

export function validate<T extends ZodTypeAny>(
  schema: T,
): RequestHandler<ParamsDictionary, unknown, z.infer<T>, unknown>;
export function validate<T extends ZodTypeAny>(
  schema: T,
  target: 'query',
): RequestHandler<ParamsDictionary, unknown, unknown, z.infer<T>>;
export function validate<T extends ZodTypeAny>(
  schema: T,
  target: 'params',
): RequestHandler<z.infer<T>, unknown, unknown, unknown>;
export function validate<T extends ZodTypeAny>(
  schema: T,
  target: ValidationTarget = 'body',
): RequestHandler {
  return (
    req: Request<ParamsDictionary, unknown, unknown, unknown>,
    _res: Response,
    next: NextFunction,
  ): void => {
    try {
      const data = req[target];
      const parsed: unknown = schema.parse(data);

      if (target === 'body') {
        (req as Request<ParamsDictionary, unknown, z.infer<T>, unknown>).body = parsed;
      } else if (target === 'query') {
        (req as Request<ParamsDictionary, unknown, unknown, z.infer<T>>).query = parsed;
      } else {
        (req as Request<z.infer<T>, unknown, unknown, unknown>).params = parsed;
      }

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errors: Record<string, string[]> = {};

        error.errors.forEach((e) => {
          const path = e.path.join('.');
          if (!errors[path]) errors[path] = [];
          errors[path].push(e.message);
        });

        next(new ValidationError('Validation failed', errors));
      } else {
        next(error);
      }
    }
  };
}
