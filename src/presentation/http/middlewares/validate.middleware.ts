import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { ValidationError } from '../../../shared/errors/domain.error';

type ValidationTarget = 'body' | 'query' | 'params';

export function validate(
  schema: ZodSchema,
  target: ValidationTarget = 'body',
) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const data = req[target];
      const parsed = schema.parse(data);
      req[target] = parsed;
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