import { NextFunction, Request, Response, RequestHandler } from 'express';
import { FeatureFlag } from './feature.enum';
import { FeatureFlagService } from './feature-flag.service';
import { ForbiddenError, UnauthorizedError } from '../../shared/errors/application.error';
import { asyncHandler } from '../../shared/utils/express.util';

export function requireFeature(
  featureFlag: FeatureFlag | string,
  featureFlagService: FeatureFlagService,
): RequestHandler {
  return asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required');
    }

    const enabled = await featureFlagService.isEnabled(featureFlag, {
      tenantId: req.tenantId ?? req.user.tenantId,
      subjectId: req.user.id,
      fallbackEnabled: false,
    });

    if (!enabled) {
      throw new ForbiddenError(`Feature '${featureFlag}' is disabled`);
    }

    next();
  });
}
