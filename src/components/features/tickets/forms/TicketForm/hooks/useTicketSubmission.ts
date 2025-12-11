"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api, endpoints } from "@/lib/api/client";
import { logger } from "@/lib/logger";
import type { TicketFormState } from "../types";

export function useTicketSubmission(
  form: TicketFormState,
  loading: boolean,
  setLoading: (loading: boolean) => void,
  validateForm: () => boolean
) {
  const router = useRouter();

  const handleSubmit = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault();

    if (loading) {
      console.warn("[TicketForm] Submit already in progress, ignoring duplicate submission");
      return;
    }

    if (!validateForm()) {
      toast.error("Please fix the highlighted errors");
      return;
    }

    setLoading(true);
    const loadingToastId = toast.loading("Creating your ticket...", {
      description: "Please wait while we process your request",
    });

    try {
      const profileData =
        form.profile && typeof form.profile === "object" && !Array.isArray(form.profile)
          ? form.profile
          : {};
      const cleanProfile = Object.fromEntries(
        Object.entries(profileData).filter(([key, value]) => key !== "undefined" && value != null)
      );

      // Extract attachments from form.details.attachments (full objects with metadata)
      // Filter out any malformed entries that don't have a valid url
      const rawAttachments = (form.details?.attachments as Array<{
        filename: string;
        url: string;
        size: number;
        mime_type: string;
      }>) || [];

      // Only use properly formed attachments (with valid url)
      const validAttachments = rawAttachments.filter(a => a && typeof a.url === 'string' && a.url.length > 0);

      // Only use legacy images if we have NO valid attachments (backwards compatibility)
      // Don't merge both sources - they now contain the same data
      let attachments = validAttachments;
      if (attachments.length === 0) {
        const legacyImages = (form.details?.images as string[]) || [];
        attachments = legacyImages
          .filter(url => typeof url === 'string' && url.length > 0)
          .map((url, index) => ({
            filename: `image-${index + 1}.jpg`,
            url,
            size: 0,
            mime_type: 'image/jpeg',
          }));
      }

      const detailsWithoutImages = { ...(form.details || {}) };
      delete detailsWithoutImages.images;
      delete detailsWithoutImages.attachments;

      // Extract location dynamically - check multiple possible sources
      // Priority: 1) details.location (dynamic field), 2) profile.hostel (editable profile field)
      // The backend will use this location to resolve scope, overriding profile-based scope
      const derivedLocation =
        (typeof form.details?.location === "string" && form.details.location.trim())
          ? form.details.location.trim()
          : (typeof form.profile?.hostel === "string" && form.profile.hostel.trim())
          ? form.profile.hostel.trim()
          : undefined;

      // Get description from either top-level form.description or from details.description
      // (subcategories with dynamic description field store it in details)
      const description = form.description?.trim()
        || (form.details?.description as string)?.trim()
        || '';

      // Generate a title from description since we don't have a title field
      const title = description.length > 50
        ? description.substring(0, 47) + "..."
        : description || "Support Request";

      const payload = {
        title,
        category_id: form.categoryId,
        subcategory_id: form.subcategoryId || undefined,
        description,
        details: detailsWithoutImages,
        attachments: attachments.length > 0 ? attachments : undefined,
        location: derivedLocation,
        profile: cleanProfile,
        priority: 'medium', // Default priority
      };

      const response = await api.post<any>(endpoints.tickets.create, payload);

      // Handle both { data: { ticket: ... } } and direct { ticket: ... } structures
      const responseData = response.data || response;
      const ticket = responseData.ticket || responseData;

      const ticketId = ticket?.id;

      if (!ticketId) {
        throw new Error("Ticket created but no ID returned");
      }

      toast.dismiss(loadingToastId);
      toast.success("Ticket created successfully!", {
        description: `Ticket #${ticketId} has been created and assigned`,
        duration: 3000,
      });

      await new Promise((resolve) => setTimeout(resolve, 500));
      router.push(`/student/dashboard/ticket/${ticketId}`);
      return;
    } catch (err: unknown) {
      logger.error({ component: "TicketForm", action: "submit", error: err }, "Ticket create error");
      const errorMessage = err instanceof Error ? err.message : "Failed to create ticket";

      toast.dismiss(loadingToastId);
      toast.error("Failed to create ticket", {
        description: errorMessage,
        duration: 5000,
      });
    } finally {
      setLoading(false);
    }
  }, [form, validateForm, router, loading, setLoading]);

  return { handleSubmit };
}
