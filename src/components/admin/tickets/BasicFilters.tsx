"use client";

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface StatusOption {
  value: string;
  label: string;
  enum: string;
}

interface CategoryOption {
  value: string;
  label: string;
  id: number;
  subcategories: Array<{ value: string; label: string; id: number }>;
}

interface BasicFiltersProps {
  category: string;
  subcategory: string;
  location: string;
  scope: string;
  status: string;
  tat: string;
  createdFrom: string;
  createdTo: string;
  onCategoryChange: (value: string) => void;
  onSubcategoryChange: (value: string) => void;
  onLocationChange: (value: string) => void;
  onScopeChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onTatChange: (value: string) => void;
  onCreatedFromChange: (value: string) => void;
  onCreatedToChange: (value: string) => void;
  categoryOptions: CategoryOption[];
  subcategoryOptions: Array<{ value: string; label: string; id: number }>;
  locationOptions: string[];
  scopeOptions: Array<{ value: string; label: string }>;
  statusOptions: StatusOption[];
  loadingFilters: boolean;
}

export function BasicFilters({
  category,
  subcategory,
  location,
  scope,
  status,
  tat,
  createdFrom,
  createdTo,
  onCategoryChange,
  onSubcategoryChange,
  onLocationChange,
  onScopeChange,
  onStatusChange,
  onTatChange,
  onCreatedFromChange,
  onCreatedToChange,
  categoryOptions,
  subcategoryOptions,
  locationOptions,
  scopeOptions,
  statusOptions,
  loadingFilters,
}: BasicFiltersProps) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div>
          <Label htmlFor="category" className="text-xs mb-1.5 block">Category</Label>
          <Select value={category || "all"} onValueChange={(value) => onCategoryChange(value === "all" ? "" : value)}>
            <SelectTrigger id="category" className="w-full h-9 text-sm">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {!loadingFilters && categoryOptions.length > 0 && categoryOptions.map((cat) => (
                <SelectItem key={cat.id} value={cat.value}>
                  {cat.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="subcategory" className="text-xs mb-1.5 block">Subcategory</Label>
          {subcategoryOptions.length > 0 ? (
            <Select value={subcategory || "all"} onValueChange={(value) => onSubcategoryChange(value === "all" ? "" : value)}>
              <SelectTrigger id="subcategory" className="w-full h-9 text-sm">
                <SelectValue placeholder="All Subcategories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Subcategories</SelectItem>
                {subcategoryOptions.map(opt => (
                  <SelectItem key={opt.id} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : category ? (
            <Input
              id="subcategory"
              value={subcategory}
              onChange={(e) => onSubcategoryChange(e.target.value)}
              placeholder="No subcategories available"
              className="h-9 text-sm"
              disabled
            />
          ) : (
            <Input
              id="subcategory"
              value={subcategory}
              onChange={(e) => onSubcategoryChange(e.target.value)}
              placeholder="Select a category first"
              className="h-9 text-sm"
              disabled
            />
          )}
        </div>
        <div>
          <Label htmlFor="location" className="text-xs mb-1.5 block">Location</Label>
          {locationOptions.length > 0 ? (
            <Select value={location || "all"} onValueChange={(value) => onLocationChange(value === "all" ? "" : value)}>
              <SelectTrigger id="location" className="w-full h-9 text-sm">
                <SelectValue placeholder="All Locations" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Locations</SelectItem>
                {locationOptions.map(opt => (
                  <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              id="location"
              value={location}
              onChange={(e) => onLocationChange(e.target.value)}
              placeholder="Enter location"
              className="h-9 text-sm"
            />
          )}
        </div>
        <div>
          <Label htmlFor="scope" className="text-xs mb-1.5 block">Scope</Label>
          {scopeOptions.length > 0 ? (
            <Select value={scope || "all"} onValueChange={(value) => onScopeChange(value === "all" ? "" : value)}>
              <SelectTrigger id="scope" className="w-full h-9 text-sm">
                <SelectValue placeholder="All Scopes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Scopes</SelectItem>
                {scopeOptions.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              id="scope"
              value={scope}
              onChange={(e) => onScopeChange(e.target.value)}
              placeholder="Enter scope"
              className="h-9 text-sm"
            />
          )}
        </div>
        <div>
          <Label htmlFor="status" className="text-xs mb-1.5 block">Status</Label>
          <Select value={status || "all"} onValueChange={(value) => onStatusChange(value === "all" ? "" : value)}>
            <SelectTrigger id="status" className="w-full h-9 text-sm">
              <SelectValue placeholder="Any Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any Status</SelectItem>
              {!loadingFilters && statusOptions.length > 0 && statusOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="tat" className="text-xs mb-1.5 block">TAT</Label>
          <Select value={tat || "all"} onValueChange={(value) => onTatChange(value === "all" ? "" : value)}>
            <SelectTrigger id="tat" className="w-full h-9 text-sm">
              <SelectValue placeholder="Any TAT" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any TAT</SelectItem>
              <SelectItem value="has">Has TAT</SelectItem>
              <SelectItem value="none">No TAT</SelectItem>
              <SelectItem value="due">Due/Past</SelectItem>
              <SelectItem value="upcoming">Upcoming</SelectItem>
              <SelectItem value="today">Today</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      
      {/* Date Range Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
        <div>
          <Label htmlFor="createdFrom" className="text-xs mb-1.5 block">Created From</Label>
          <Input
            id="createdFrom"
            type="date"
            value={createdFrom}
            onChange={(e) => onCreatedFromChange(e.target.value)}
            className="h-9 text-sm"
          />
        </div>
        <div>
          <Label htmlFor="createdTo" className="text-xs mb-1.5 block">Created To</Label>
          <Input
            id="createdTo"
            type="date"
            value={createdTo}
            onChange={(e) => onCreatedToChange(e.target.value)}
            className="h-9 text-sm"
          />
        </div>
      </div>
    </div>
  );
}
