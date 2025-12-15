"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState, useEffect, useMemo, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Filter, Search, X, ChevronDown, ChevronUp, RotateCcw, ArrowUpDown, Loader2 } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { BasicFilters } from "./BasicFilters";
import { FilterActions } from "./FilterActions";

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

interface AdminTicketFiltersProps {
  statuses?: Array<{
    id: number;
    value: string;
    label: string;
    color?: string | null;
    progress_percent?: number | null;
  }>;
  categories?: Array<{
    id: number;
    name: string;
    slug?: string | null;
    icon?: string | null;
    color?: string | null;
    subcategories: Array<{
      id: number;
      name: string;
      slug?: string | null;
      category_id: number;
    }>;
  }>;
  domains?: Array<{
    id: number;
    name: string;
    slug?: string | null;
    description?: string | null;
  }>;
  scopes?: Array<{
    id: number;
    name: string;
    slug?: string | null;
    domain_id: number;
  }>;
}

export function AdminTicketFilters({
  statuses: serverStatuses,
  categories: serverCategories,
  domains: serverDomains,
  scopes: serverScopes,
}: AdminTicketFiltersProps = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  
  // Filter options: use server props if provided, otherwise fall back to client-side fetching
  const [statusOptions, setStatusOptions] = useState<StatusOption[]>(
    serverStatuses?.map(s => ({
      value: s.value,
      label: s.label,
      enum: s.value,
    })) || []
  );
  
  const [categoryOptions, setCategoryOptions] = useState<CategoryOption[]>(
    serverCategories?.map(cat => ({
      id: cat.id,
      value: cat.id.toString(),
      label: cat.name,
      subcategories: cat.subcategories.map(sub => ({
        id: sub.id,
        value: sub.id.toString(),
        label: sub.name,
      })),
    })) || []
  );
  
  const [domainOptions, setDomainOptions] = useState<Array<{ value: string; label: string }>>(
    serverDomains?.map(d => ({
      value: d.slug || d.id?.toString() || d.name,
      label: d.name,
    })) || []
  );

  const [locationOptions, setLocationOptions] = useState<string[]>([]);
  const [isApplying, setIsApplying] = useState(false);
  const [loadingFilters, setLoadingFilters] = useState(!serverStatuses); // Only load if props not provided
  
  const [searchQuery, setSearchQuery] = useState<string>(searchParams.get("search") || "");
  const [category, setCategory] = useState<string>(searchParams.get("category") || "");
  const [subcategory, setSubcategory] = useState<string>(searchParams.get("subcategory") || "");
  const [location, setLocation] = useState<string>(searchParams.get("location") || "");
  const [scope, setScope] = useState<string>(searchParams.get("scope") || "");
  const [tat, setTat] = useState<string>(searchParams.get("tat") || "");
  const [status, setStatus] = useState<string>(searchParams.get("status") || "");
  
  const [scopeOptions, setScopeOptions] = useState<Array<{ value: string; label: string }>>(
    serverScopes?.map(s => ({
      value: s.id.toString(),
      label: s.name,
    })) || []
  );
  
  // Fallback: client-side fetching only if props not provided (backward compatibility)
  useEffect(() => {
    // Skip if filters already provided via props (server-side)
    if (serverStatuses && serverCategories && serverDomains) {
      return;
    }

    const fetchFilters = async () => {
      try {
        setLoadingFilters(true);
        
        // Fetch statuses
        const statusRes = await fetch("/api/filters/statuses", {
          credentials: 'include',
        });
        if (statusRes.ok) {
          const statusData = await statusRes.json();
          const statuses = Array.isArray(statusData) ? statusData : (statusData.statuses || []);
          setStatusOptions(statuses.map((s: any) => ({
            value: s.value,
            label: s.label || s.value,
            enum: s.value,
          })));
        }
        
        // Fetch categories
        const categoryRes = await fetch("/api/filters/categories", {
          credentials: 'include',
        });
        if (categoryRes.ok) {
          const categoryData = await categoryRes.json();
          const categories = Array.isArray(categoryData) ? categoryData : (categoryData.categories || []);
          setCategoryOptions(categories.map((cat: any) => ({
            id: cat.id,
            value: cat.id.toString(),
            label: cat.name,
            subcategories: (cat.subcategories || []).map((sub: any) => ({
              id: sub.id,
              value: sub.id.toString(),
              label: sub.name,
            })),
          })));
        }
        
        // Fetch domains
        const domainRes = await fetch("/api/domains", {
          credentials: 'include',
        });
        if (domainRes.ok) {
          const domainData = await domainRes.json();
          const domains = Array.isArray(domainData) ? domainData : (domainData.domains || []);
          setDomainOptions(domains.map((d: any) => ({
            value: d.slug || d.id?.toString?.() || d.name,
            label: d.name,
          })));
        }
      } catch (error) {
        console.error("Error fetching filters:", error);
      } finally {
        setLoadingFilters(false);
      }
    };
    
    fetchFilters();
  }, [serverStatuses, serverCategories, serverDomains]);
  const [createdFrom, setCreatedFrom] = useState<string>(searchParams.get("from") || "");
  const [createdTo, setCreatedTo] = useState<string>(searchParams.get("to") || "");
  const [userNumber, setUserNumber] = useState<string>(searchParams.get("user") || "");
  const [sort, setSort] = useState<string>(searchParams.get("sort") || "newest");
  const [isExpanded, setIsExpanded] = useState<boolean>(false);

  // Get subcategories for selected category from database
  const subcategoryOptions = useMemo(() => {
    if (!category) return [] as Array<{ value: string; label: string; id: number }>;
    const selectedCategory = categoryOptions.find(cat => cat.value === category);
    return selectedCategory?.subcategories || [];
  }, [category, categoryOptions]);

  // Clear subcategory if it's not valid for the selected category
  useEffect(() => {
    if (category && subcategory) {
      const selectedCategory = categoryOptions.find(cat => cat.value === category);
      const isValidSubcategory = selectedCategory?.subcategories.some(sub => sub.value === subcategory);
      if (!isValidSubcategory) {
        setSubcategory("");
      }
    } else if (!category && subcategory) {
      // Clear subcategory if no category is selected
      setSubcategory("");
    }
  }, [category, subcategory, categoryOptions]);

  // Fetch location options from database when category/subcategory changes
  useEffect(() => {
    const fetchLocations = async () => {
      if (!category) {
        setLocationOptions([]);
        return;
      }

      try {
        const params = new URLSearchParams();
        params.set("category", category);
        if (subcategory) {
          params.set("subcategory", subcategory);
        }

        const locationRes = await fetch(`/api/filters/locations?${params.toString()}`, {
          credentials: 'include', // Include cookies for Clerk authentication
        });
        if (locationRes.ok) {
          const locationData = await locationRes.json();
          setLocationOptions(locationData.locations || []);
        } else {
          // If API fails, set empty array instead of throwing
          setLocationOptions([]);
        }
      } catch (error) {
        // Silently handle errors - location filter is optional
        console.error("Error fetching locations:", error);
        setLocationOptions([]);
      }
    };

    fetchLocations();
  }, [category, subcategory]);

  useEffect(() => {
    setSearchQuery(searchParams.get("search") || "");
    setCategory(searchParams.get("category") || "");
    setSubcategory(searchParams.get("subcategory") || "");
    setLocation(searchParams.get("location") || "");
    setTat(searchParams.get("tat") || "");
    const urlStatus = searchParams.get("status") || "";
    // Only set status filter if it's valid and options are loaded
    if (urlStatus && statusOptions.length > 0) {
      const validStatuses = statusOptions.map(s => s.value);
      setStatus(validStatuses.includes(urlStatus) ? urlStatus : "");
    } else if (!urlStatus) {
      setStatus("");
    }
    setCreatedFrom(searchParams.get("from") || "");
    setCreatedTo(searchParams.get("to") || "");
    setUserNumber(searchParams.get("user") || "");
    setSort(searchParams.get("sort") || "newest");
  }, [searchParams, statusOptions]);

  const activeFilters = useMemo(() => {
    const filters: Array<{ key: string; label: string; value: string }> = [];
    
    // Helper to truncate long values
    const truncate = (value: string, maxLength: number = 30): string => {
      if (value.length <= maxLength) return value;
      return value.substring(0, maxLength - 3) + "...";
    };
    
    // Helper to format filter values
    const formatValue = (key: string, value: string): string => {
      switch (key) {
        case "tat":
          const tatLabels: Record<string, string> = {
            "today": "Today",
            "due": "Overdue",
            "has": "Has TAT",
            "none": "No TAT",
            "upcoming": "Upcoming",
          };
          return tatLabels[value] || value;
        case "status":
          const statusOption = statusOptions.find(s => s.value === value);
          return statusOption ? statusOption.label : value;
        case "category":
          const categoryOption = categoryOptions.find(c => c.value === value);
          return categoryOption ? categoryOption.label : value;
        case "subcategory":
          const subcategoryOption = subcategoryOptions.find(s => s.value === value);
          return subcategoryOption ? subcategoryOption.label : value;
        case "sort":
          const sortLabels: Record<string, string> = {
            "newest": "Newest First",
            "oldest": "Oldest First",
            "status": "Status",
            "due-date": "Due Date",
          };
          return sortLabels[value] || value;
        default:
          return truncate(value);
      }
    };
    
    if (searchQuery) filters.push({ key: "search", label: "Search", value: truncate(searchQuery, 25) });
    if (category) filters.push({ key: "category", label: "Category", value: formatValue("category", category) });
    if (subcategory) filters.push({ key: "subcategory", label: "Subcategory", value: formatValue("subcategory", subcategory) });
    if (location) filters.push({ key: "location", label: "Location", value: truncate(location, 25) });
    if (scope) {
      const scopeOption = scopeOptions.find(s => s.value === scope);
      filters.push({ key: "scope", label: "Scope", value: scopeOption ? scopeOption.label : truncate(scope, 25) });
    }
    if (tat) filters.push({ key: "tat", label: "TAT", value: formatValue("tat", tat) });
    if (status) filters.push({ key: "status", label: "Status", value: formatValue("status", status) });
    if (createdFrom) filters.push({ key: "from", label: "From", value: createdFrom });
    if (createdTo) filters.push({ key: "to", label: "To", value: createdTo });
    if (userNumber) filters.push({ key: "user", label: "User", value: truncate(userNumber, 20) });
    if (sort && sort !== "newest") filters.push({ key: "sort", label: "Sort", value: formatValue("sort", sort) });
    return filters;
  }, [searchQuery, category, subcategory, location, scope, tat, status, createdFrom, createdTo, userNumber, sort, statusOptions, categoryOptions, subcategoryOptions, scopeOptions]);

  const removeFilter = useCallback((key: string) => {
    const params = new URLSearchParams();
    
    // Build params from current state, excluding the removed filter
    if (key !== "search" && searchQuery) params.set("search", searchQuery);
    if (key !== "category" && category) params.set("category", category);
    if (key !== "subcategory" && subcategory) params.set("subcategory", subcategory);
    if (key !== "location" && location) params.set("location", location);
    if (key !== "scope" && scope) params.set("scope", scope);
    if (key !== "tat" && tat) params.set("tat", tat);
    if (key !== "status" && status) params.set("status", status);
    if (key !== "from" && createdFrom) params.set("from", createdFrom);
    if (key !== "to" && createdTo) params.set("to", createdTo);
    if (key !== "user" && userNumber) params.set("user", userNumber);
    if (key !== "sort" && sort && sort !== "newest") params.set("sort", sort);
    
    // Update state
    switch (key) {
      case "search": setSearchQuery(""); break;
      case "category": setCategory(""); break;
      case "subcategory": setSubcategory(""); break;
      case "location": setLocation(""); break;
      case "scope": setScope(""); break;
      case "tat": setTat(""); break;
      case "status": setStatus(""); break;
      case "from": setCreatedFrom(""); break;
      case "to": setCreatedTo(""); break;
      case "user": setUserNumber(""); break;
      case "sort": setSort("newest"); break;
    }
    
    // Apply filters immediately
    router.push(`${pathname}${params.toString() ? `?${params.toString()}` : ""}`);
  }, [searchQuery, category, subcategory, location, tat, status, createdFrom, createdTo, userNumber, sort, pathname, router]);

  const apply = useCallback(() => {
    setIsApplying(true);
    const params = new URLSearchParams();
    if (searchQuery) params.set("search", searchQuery);
    if (category) params.set("category", category);
    if (subcategory) params.set("subcategory", subcategory);
    if (location) params.set("location", location);
    if (scope) params.set("scope", scope);
    if (tat) params.set("tat", tat);
    if (status) params.set("status", status);
    if (createdFrom) params.set("from", createdFrom);
    if (createdTo) params.set("to", createdTo);
    if (userNumber) params.set("user", userNumber);
    if (sort && sort !== "newest") params.set("sort", sort);
    router.push(`${pathname}${params.toString() ? `?${params.toString()}` : ""}`);
    // Reset loading state after navigation
    setTimeout(() => setIsApplying(false), 500);
  }, [searchQuery, category, subcategory, location, scope, tat, status, createdFrom, createdTo, userNumber, sort, pathname, router]);

  const reset = useCallback(() => {
    setSearchQuery("");
    setCategory("");
    setSubcategory("");
    setLocation("");
    setScope("");
    setTat("");
    setStatus("");
    setCreatedFrom("");
    setCreatedTo("");
    setUserNumber("");
    setSort("newest");
    router.push(pathname);
  }, [pathname, router]);

  // Quick action handlers
  const handleTatToday = useCallback(() => {
    setTat(tat === "today" ? "" : "today");
    apply();
  }, [tat, apply]);

  const handleTatDue = useCallback(() => {
    setTat(tat === "due" ? "" : "due");
    apply();
  }, [tat, apply]);

  // Dynamic domain quick action handlers
  const handleDomainToggle = useCallback((domainValue: string) => {
    setCategory(category === domainValue ? "" : domainValue);
    apply();
  }, [category, apply]);

  return (
    <Card className="border shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Filter className="w-4 h-4 text-muted-foreground" />
            Filters & Search
            {activeFilters.length > 0 && (
              <Badge variant="secondary" className="ml-2">
                {activeFilters.length}
              </Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            {activeFilters.length > 0 && (
              <Button variant="ghost" size="sm" onClick={reset} className="text-xs h-7">
                <RotateCcw className="w-3 h-3 mr-1" />
                Clear
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
              className="h-7"
            >
              {isExpanded ? (
                <>
                  <ChevronUp className="w-4 h-4 mr-1" />
                  Collapse
                </>
              ) : (
                <>
                  <ChevronDown className="w-4 h-4 mr-1" />
                  Expand
                </>
              )}
            </Button>
          </div>
        </div>
      </CardHeader>
      
      {/* Collapsed View - Always Visible */}
      <CardContent className={isExpanded ? "space-y-4" : "pb-3"}>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input
              placeholder="Search tickets..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && apply()}
              className="pl-9 pr-9 h-9 text-sm"
              disabled={isApplying}
            />
            {searchQuery && (
              <Button
                variant="ghost"
                size="sm"
                className="absolute right-1 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0"
                onClick={() => setSearchQuery("")}
                disabled={isApplying}
              >
                <X className="w-3 h-3" />
              </Button>
            )}
          </div>
          <Button
            onClick={apply}
            disabled={isApplying}
            className="h-9 px-4 min-w-[100px]"
          >
            {isApplying ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Applying...
              </>
            ) : (
              <>
                <Search className="w-4 h-4 mr-2" />
                Apply
              </>
            )}
          </Button>
        </div>

        <FilterActions
          activeFilters={activeFilters}
          onRemoveFilter={removeFilter}
          onReset={reset}
          onApply={apply}
          tat={tat}
          category={category}
          onTatToday={handleTatToday}
          onTatDue={handleTatDue}
          onDomainToggle={handleDomainToggle}
          domainOptions={domainOptions}
          isApplying={isApplying}
          isExpanded={isExpanded}
          onToggleExpand={() => setIsExpanded(!isExpanded)}
        />

        {/* Expanded View */}
        {isExpanded && (
          <>
            <Separator className="my-4" />

            {/* Filters Section */}
            <div className="space-y-2">
              <Badge variant="outline" className="text-xs font-semibold border-primary/30 bg-primary/5 text-primary px-2 py-1">
                <Filter className="w-3 h-3 mr-1.5" />
                Filters
              </Badge>
              <BasicFilters
                category={category}
                subcategory={subcategory}
                location={location}
                scope={scope}
                status={status}
                tat={tat}
                createdFrom={createdFrom}
                createdTo={createdTo}
                onCategoryChange={(value) => {
                  setCategory(value);
                  // Clear subcategory when category changes
                  const clearedSubcategory = value !== category ? "" : subcategory;
                  if (value !== category) {
                    setSubcategory("");
                  }
                  // Auto-apply category filter when changed
                  const params = new URLSearchParams();
                  if (searchQuery) params.set("search", searchQuery);
                  if (value) params.set("category", value);
                  if (clearedSubcategory) params.set("subcategory", clearedSubcategory);
                  if (location) params.set("location", location);
                  if (scope) params.set("scope", scope);
                  if (tat) params.set("tat", tat);
                  if (status) params.set("status", status);
                  if (createdFrom) params.set("from", createdFrom);
                  if (createdTo) params.set("to", createdTo);
                  if (userNumber) params.set("user", userNumber);
                  if (sort && sort !== "newest") params.set("sort", sort);
                  router.push(`${pathname}${params.toString() ? `?${params.toString()}` : ""}`);
                }}
                onSubcategoryChange={(value) => {
                  setSubcategory(value);
                  // Auto-apply subcategory filter when changed
                  const params = new URLSearchParams();
                  if (searchQuery) params.set("search", searchQuery);
                  if (category) params.set("category", category);
                  if (value) params.set("subcategory", value);
                  if (location) params.set("location", location);
                  if (scope) params.set("scope", scope);
                  if (tat) params.set("tat", tat);
                  if (status) params.set("status", status);
                  if (createdFrom) params.set("from", createdFrom);
                  if (createdTo) params.set("to", createdTo);
                  if (userNumber) params.set("user", userNumber);
                  if (sort && sort !== "newest") params.set("sort", sort);
                  router.push(`${pathname}${params.toString() ? `?${params.toString()}` : ""}`);
                }}
                onLocationChange={setLocation}
                onScopeChange={setScope}
                onStatusChange={setStatus}
                onTatChange={setTat}
                onCreatedFromChange={setCreatedFrom}
                onCreatedToChange={setCreatedTo}
                categoryOptions={categoryOptions}
                subcategoryOptions={subcategoryOptions}
                locationOptions={locationOptions}
                scopeOptions={scopeOptions}
                statusOptions={statusOptions}
                loadingFilters={loadingFilters}
              />
            </div>

            {/* Sorting Section */}
            <div className="space-y-2 pt-3 border-t">
              <Badge variant="outline" className="text-xs font-semibold border-muted-foreground/30 bg-muted/30 text-muted-foreground px-2 py-1">
                <ArrowUpDown className="w-3 h-3 mr-1.5" />
                Sorting
              </Badge>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <Label htmlFor="sort" className="text-xs mb-1.5 block">Sort By</Label>
                  <Select value={sort} onValueChange={setSort}>
                    <SelectTrigger id="sort" className="w-full h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="newest">Newest First</SelectItem>
                      <SelectItem value="oldest">Oldest First</SelectItem>
                      <SelectItem value="status">Status</SelectItem>
                      <SelectItem value="due-date">Due Date</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

          </>
        )}
      </CardContent>
    </Card>
  );
}


