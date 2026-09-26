/** Minimal service registry used by the composition root (src/bootstrap/container). */
export class Container {
  private services = new Map<string, unknown>();

  register<T>(name: string, instance: T): void {
    this.services.set(name, instance);
  }

  resolve<T>(name: string): T {
    const service = this.services.get(name);
    if (!service) {
      throw new Error(`Service '${name}' not registered in container`);
    }
    return service as T;
  }
}
