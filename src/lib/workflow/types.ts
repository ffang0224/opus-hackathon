export type WorkflowPrimitiveType = "str" | "float" | "bool" | "date" | "file" | "array" | "array_files" | "object";

export type WorkflowVariable = {
  id?: string;
  variable_name: string;
  display_name?: string;
  display_description?: string;
  description?: string;
  type: WorkflowPrimitiveType;
  is_nullable?: boolean;
  tags?: Array<{
    variable_name?: string;
    value?: unknown;
    description?: string;
  }>;
  options?: unknown[];
  type_definition?: Record<string, WorkflowVariable> | WorkflowVariable | string | null;
  value?: unknown;
};

export type WorkflowSchema = {
  workflowId?: string;
  name?: string;
  jobPayloadSchema: Record<string, WorkflowVariable>;
  jobResultsPayloadSchema: Record<string, WorkflowVariable>;
};

export type OpusConfig = {
  enabled: boolean;
  mode: "live" | "manual";
  reason?: string;
  baseUrl?: string;
  authHeaderName?: string;
  endpoints?: {
    workflowDetails: string;
    initiateJob: string;
    getUploadUrl: string;
    executeJob: string;
    status: string;
    results: string;
    audit: string;
  };
};
