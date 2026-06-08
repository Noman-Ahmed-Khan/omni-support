const INJECTION_METADATA = Symbol('omnisupport:inject-metadata');

interface InjectionDefinition {
  propertyKey: string | symbol;
  token: string;
}

interface InjectableConstructor {
  [INJECTION_METADATA]?: InjectionDefinition[];
}

export function Inject(token?: string): PropertyDecorator {
  return (target: object, propertyKey: string | symbol) => {
    const ctor = target.constructor as InjectableConstructor;
    const injections = ctor[INJECTION_METADATA] ?? [];

    injections.push({
      propertyKey,
      token: token ?? String(propertyKey),
    });

    ctor[INJECTION_METADATA] = injections;
  };
}

export function resolveInjectedProperties<T extends object>(
  instance: T,
  container: {
    resolve<Value>(name: string): Value;
  },
): T {
  const ctor = instance.constructor as InjectableConstructor;
  const injections = ctor[INJECTION_METADATA] ?? [];

  for (const injection of injections) {
    (instance as Record<string | symbol, unknown>)[injection.propertyKey] =
      container.resolve(injection.token);
  }

  return instance;
}
