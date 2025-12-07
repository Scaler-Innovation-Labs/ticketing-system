"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";

interface StaffMember {
  id: string;
  clerkUserId: string | null;
  fullName: string;
  email: string | null;
  slackUserId: string | null;
  whatsappNumber: string | null;
  role: string;
  domain: string;
  scope: string | null;
}

interface ClerkUser {
  id: string;
  firstName: string | null;
  lastName: string | null;
  emailAddresses?: Array<{ emailAddress: string }>;
  name?: string;
  email?: string;
}

interface MasterData {
  hostels: Array<{ id: number; name: string }>;
  domains: Array<{ id: number; value: string; label: string }>;
  roles: Array<{ value: string; label: string; description: string | null }>;
  scopes: Array<{ id: number; domain_id: number; value: string; label: string }>;
}

type StaffFormData = {
  clerkUserId: string;
  email: string;
  firstName: string;
  lastName: string;
  domain: string;
  scope: string;
  role: string;
  slackUserId: string;
  whatsappNumber: string;
};

interface StaffFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingStaff: StaffMember | null;
  formData: StaffFormData;
  onFormDataChange: (data: Partial<StaffFormData>) => void;
  staff: StaffMember[];
  masterData: MasterData | null;
  errors: Record<string, string>;
  saving: boolean;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
  selectedUserEmail: string;
}

export function StaffForm({
  open,
  onOpenChange,
  editingStaff,
  formData,
  onFormDataChange,
  staff,
  masterData,
  errors,
  saving,
  onSubmit,
  onClose,
  selectedUserEmail,
}: StaffFormProps) {

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingStaff ? "Edit Staff Member" : "Add New Staff Member"}</DialogTitle>
          <DialogDescription>
            {editingStaff ? "Update staff member details" : "Assign an admin to a domain and location. This determines which tickets they will automatically receive. Note: Domain and scope are optional for Super Admin."}
          </DialogDescription>
          {!editingStaff && (
            <ul className="mt-2 ml-4 list-disc text-sm space-y-1 text-muted-foreground">
              <li><strong>Domain:</strong> Select the category (Hostel/College). Optional for Super Admin.</li>
              <li><strong>Scope:</strong> For Hostel domain, select specific hostel. For College, no scope needed. Optional for Super Admin.</li>
            </ul>
          )}
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          {!editingStaff && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Enter the details of the staff member. If a user with this email already exists, they will be assigned the staff role. Otherwise, a new user account will be created.
              </p>
            </div>
          )}
          {editingStaff && (
            <div className="p-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg">
              <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                Editing: {editingStaff.fullName}
              </p>
              <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                You can update domain, scope, role, and contact information. User cannot be changed.
              </p>
            </div>
          )}

          <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name *</Label>
                <Input
                  id="firstName"
                  value={formData.firstName}
                  onChange={(e) => onFormDataChange({ firstName: e.target.value })}
                  placeholder="John"
                  className={errors.firstName ? "border-destructive" : ""}
                  required
                />
                {errors.firstName && (
                  <p className="text-sm text-destructive">{errors.firstName}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name *</Label>
                <Input
                  id="lastName"
                  value={formData.lastName}
                  onChange={(e) => onFormDataChange({ lastName: e.target.value })}
                  placeholder="Doe"
                  className={errors.lastName ? "border-destructive" : ""}
                  required
                />
                {errors.lastName && (
                  <p className="text-sm text-destructive">{errors.lastName}</p>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => onFormDataChange({ email: e.target.value })}
                placeholder="john.doe@example.com"
                className={errors.email ? "border-destructive" : ""}
                required
              />
              <p className="text-xs text-muted-foreground">
                User must sign up with Clerk using this email address.
              </p>
              {errors.email && (
                <p className="text-sm text-destructive">{errors.email}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="domain">
                Domain <span className="text-red-500">*</span>
              </Label>
              <Select
                value={formData.domain}
                onValueChange={(value) => {
                  onFormDataChange({ domain: value });
                }}
                required
              >
                <SelectTrigger id="domain" className={errors.domain ? "border-destructive" : ""}>
                  <SelectValue placeholder={masterData ? "Select domain" : "Loading..."} />
                </SelectTrigger>
                <SelectContent>
                  {!masterData ? (
                    <SelectItem value="loading" disabled>Loading domains...</SelectItem>
                  ) : masterData.domains.length === 0 ? (
                    <SelectItem value="empty" disabled>No domains available</SelectItem>
                  ) : (
                    masterData.domains
                      .filter(domain => domain.value && domain.value.trim() !== "")
                      .map((domain) => (
                        <SelectItem key={domain.value} value={domain.value}>
                          {domain.label}
                        </SelectItem>
                      ))
                  )}
                </SelectContent>
              </Select>
              {errors.domain && (
                <p className="text-sm text-destructive">{errors.domain}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="scope">
                Scope (Hostel/Location) <span className="text-red-500">*</span>
              </Label>
              <Select
                value={formData.scope}
                onValueChange={(value) => {
                  onFormDataChange({ scope: value });
                }}
                required
                disabled={!masterData || !formData.domain}
              >
                <SelectTrigger id="scope" className={errors.scope ? "border-destructive" : ""}>
                  <SelectValue placeholder={
                    !formData.domain
                      ? "Select domain first"
                      : masterData
                        ? "Select location/hostel"
                        : "Loading..."
                  } />
                </SelectTrigger>
                <SelectContent>
                  {!masterData ? (
                    <SelectItem value="loading" disabled>Loading locations...</SelectItem>
                  ) : (
                    <>
                      {/* Filter scopes based on selected domain */}
                      {(() => {
                        const selectedDomainObj = masterData.domains.find(d => d.value === formData.domain);
                        const domainScopes = selectedDomainObj
                          ? masterData.scopes.filter(s => s.domain_id === selectedDomainObj.id)
                          : [];

                        // If domain is "Hostel", show hostels from hostels table
                        // Note: This assumes "Hostel" is the name of the domain. 
                        // Better to check by ID if possible, but name is what we have in formData.
                        const isHostelDomain = formData.domain === "Hostel";

                        if (domainScopes.length === 0 && !isHostelDomain) {
                          return <SelectItem value="empty" disabled>No locations found for this domain</SelectItem>;
                        }

                        return (
                          <>
                            {domainScopes.map((scope) => (
                              <SelectItem key={`scope-${scope.value}`} value={scope.value}>
                                {scope.label}
                              </SelectItem>
                            ))}

                            {isHostelDomain && masterData.hostels.length > 0 && (
                              <>
                                {domainScopes.length > 0 && (
                                  <SelectItem value="divider" disabled>
                                    ──── Hostels ────
                                  </SelectItem>
                                )}
                                {masterData.hostels
                                  .filter(hostel => !domainScopes.some(scope => scope.value === hostel.name))
                                  .map((hostel) => (
                                    <SelectItem key={`hostel-${hostel.id}`} value={hostel.name}>
                                      {hostel.name}
                                    </SelectItem>
                                  ))}
                              </>
                            )}
                          </>
                        );
                      })()}
                    </>
                  )}
                </SelectContent>
              </Select>
              {masterData && masterData.scopes.length === 0 && masterData.hostels.length === 0 && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  ⚠️ No locations configured. Please add staff with locations or configure hostels first.
                </p>
              )}
              {masterData && masterData.scopes.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  📍 Showing {masterData.scopes.length} existing location{masterData.scopes.length !== 1 ? 's' : ''} from staff data
                  {masterData.hostels.length > 0 && ` + ${masterData.hostels.length} from hostels table`}
                </p>
              )}
              {errors.scope && (
                <p className="text-sm text-destructive">{errors.scope}</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="role">Role *</Label>
            <Select
              value={formData.role}
              onValueChange={(value) => {
                onFormDataChange({ role: value });
              }}
              required
              disabled={!masterData || masterData.roles.length === 0}
            >
              <SelectTrigger id="role" className={errors.role ? "border-destructive" : ""}>
                <SelectValue placeholder={masterData ? "Select role" : "Loading..."} />
              </SelectTrigger>
              <SelectContent>
                {!masterData ? (
                  <SelectItem value="loading" disabled>Loading roles...</SelectItem>
                ) : masterData.roles.length === 0 ? (
                  <SelectItem value="empty" disabled>No roles available</SelectItem>
                ) : (
                  masterData.roles
                    .filter(role => role.value && role.value.trim() !== "")
                    .map((role) => (
                      <SelectItem key={role.value} value={role.value}>
                        {role.label}
                      </SelectItem>
                    ))
                )}
              </SelectContent>
            </Select>
            {masterData && masterData.roles.length === 0 && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                ⚠️ No staff roles configured. Please configure roles in the system.
              </p>
            )}
            {errors.role && (
              <p className="text-sm text-destructive">{errors.role}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="slackUserId">Slack User ID</Label>
              <Input
                id="slackUserId"
                value={formData.slackUserId}
                onChange={(e) => onFormDataChange({ slackUserId: e.target.value })}
                placeholder="U0123ABCD"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="whatsappNumber">WhatsApp Number</Label>
              <Input
                id="whatsappNumber"
                value={formData.whatsappNumber}
                onChange={(e) => onFormDataChange({ whatsappNumber: e.target.value })}
                placeholder="+1234567890"
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                editingStaff ? "Update" : "Create"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
