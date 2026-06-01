export interface DeleteCustomerCommand {
  tenantId: string;
  customerId: string;
  deletedById: string;
  deletedByRole: string;
}
