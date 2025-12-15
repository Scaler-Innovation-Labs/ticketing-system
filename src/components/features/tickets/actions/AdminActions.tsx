"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCw, Clock, CheckCircle, FileText, UserCog, ArrowUpRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ReassignDialog } from "../dialogs/ReassignDialog";
import { normalizeStatusForComparison } from "@/lib/utils";
import { logger } from "@/lib/logger";

type ForwardTarget = {
	id: string;
	name: string;
	email: string | null;
};

export function AdminActions({
	ticketId,
	currentStatus,
	hasTAT,
	isSuperAdmin = false,
	currentAssignedTo,
	forwardTargets = [],
	tatExtensionCount: _tatExtensionCount = 0,
	onStatusChanged,
}: {
	ticketId: number;
	currentStatus: string;
	hasTAT?: boolean;
	isSuperAdmin?: boolean;
	currentAssignedTo?: string | null;
	forwardTargets?: ForwardTarget[];
	tatExtensionCount?: number;
	onStatusChanged?: (newStatus: string) => void;
}) {
	const [loading, setLoading] = useState<string | null>(null);
	const [optimisticStatus, setOptimisticStatus] = useState<string | null>(null);
	const [showCustomTat, setShowCustomTat] = useState(false);
	const [showCommentForm, setShowCommentForm] = useState(false);
	// Delete dialog state removed
	const [showReassignDialog, setShowReassignDialog] = useState(false);
	const [showForwardDialog, setShowForwardDialog] = useState(false);
	const [showResolveDialog, setShowResolveDialog] = useState(false);
	const [resolveComment, setResolveComment] = useState("");
	const [tat, setTat] = useState("");
	const [comment, setComment] = useState("");
	const [forwardReason, setForwardReason] = useState("");
	const [selectedForwardAdmin, setSelectedForwardAdmin] = useState<string>("auto");
	const [commentType, setCommentType] = useState<"comment" | "question" | "internal" | "super_admin">("comment");

	const DEFAULT_TAT = "48 hours";
	
	// Use optimistic status if set, otherwise use current status
	const effectiveStatus = optimisticStatus || currentStatus;
	const normalizedStatus = normalizeStatusForComparison(effectiveStatus);
	const hasForwardTargets = Array.isArray(forwardTargets) && forwardTargets.length > 0;
	const handleMarkInProgress = async () => {
		// Optimistic update - update UI immediately
		setOptimisticStatus("in_progress");
		if (onStatusChanged) {
			onStatusChanged("in_progress");
		}
		setLoading("mark");

		try {
			const response = await fetch(`/api/tickets/${ticketId}/tat`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				credentials: 'include',
				body: JSON.stringify({ tat: DEFAULT_TAT, markInProgress: true }),
			});

			if (response.ok) {
				toast.success("Ticket marked In Progress with 48h TAT");
				// FIX #4: Cache invalidation happens server-side in API route
				// No router.refresh() needed - optimistic update provides instant feedback
				// Keep optimistic status - it will be cleared when user navigates or page refreshes naturally
			} else {
				// Rollback optimistic update
				setOptimisticStatus(null);
				if (onStatusChanged) {
					onStatusChanged(currentStatus);
				}
				const error = await response.json().catch(() => ({ error: "Failed to mark in progress" }));
				const errorMessage = typeof error.error === 'string' ? error.error : "Failed to mark in progress";
				toast.error(errorMessage);
			}
		} catch (error) {
			// Rollback optimistic update
			setOptimisticStatus(null);
			if (onStatusChanged) {
				onStatusChanged(currentStatus);
			}
			logger.error({ error, component: "AdminActions", action: "markInProgress" }, "Error marking in progress");
			toast.error("Failed to mark in progress. Please try again.");
		} finally {
			setLoading(null);
		}
	};


	// FIX #7: Removed unnecessary useEffect - reset only on submit/cancel
	// This prevents extra renders and dialog jitter


	const handleSetTAT = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!tat.trim()) return;

		setLoading("tat");
		try {
			// Set TAT and update status to in_progress if not already
			const shouldMarkInProgress = normalizedStatus !== "in_progress";
			
			// Optimistic update - update UI immediately
			if (shouldMarkInProgress) {
				setOptimisticStatus("in_progress");
				if (onStatusChanged) {
					onStatusChanged("in_progress");
				}
			}
			
			// If we're not in progress yet, force a "set" (not extension) so the API can change status.
			const isExtension = normalizedStatus === "in_progress";

			const url = `/api/tickets/${ticketId}/tat`;
			const response = await fetch(url, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				credentials: 'include',
				body: JSON.stringify({
					tat,
					markInProgress: shouldMarkInProgress,
					isExtension,
				}),
			});

			if (response.ok) {
				setTat("");
				setShowCustomTat(false);
				const responseData = await response.json().catch(() => ({}));
				toast.success(responseData.message || "TAT set successfully");
				// TAT API already handles status update atomically when markInProgress=true
				// No fallback needed - single transaction ensures consistency
				// Cache invalidation happens server-side in API route
				// Keep optimistic status - it will be cleared when data updates naturally
			} else {
				// Rollback optimistic update on error
				if (shouldMarkInProgress) {
					setOptimisticStatus(null);
					if (onStatusChanged) {
						onStatusChanged(currentStatus);
					}
				}
				const errorData = await response.json().catch(() => ({ error: "Failed to set TAT" }));
				logger.error({ ...errorData, component: "AdminActions", action: "setTAT" }, "TAT API error");
				const errorMessage = typeof errorData.error === 'string' ? errorData.error : (typeof errorData.details === 'string' ? errorData.details : "Failed to set TAT");
				toast.error(errorMessage);
			}
		} catch (error: unknown) {
			// Extract error message from various error types
			let errorMessage = "Failed to set TAT";
			let errorDetails: any = {};

			if (error instanceof Error) {
				errorMessage = error.message || errorMessage;
				errorDetails = {
					message: error.message,
					name: error.name,
					stack: error.stack,
				};
			} else if (error && typeof error === 'object') {
				if ('message' in error && typeof error.message === 'string') {
					errorMessage = error.message;
				}
				errorDetails = { ...error };
			} else {
				errorDetails = { raw: String(error) };
			}

			logger.error(
				{
					error: errorDetails,
					errorMessage,
					component: "AdminActions",
					action: "setTAT",
					ticketId,
					url: `/api/tickets/${ticketId}/tat`,
				},
				"Error setting TAT"
			);
			toast.error(errorMessage || "Failed to set TAT. Please try again.");
		} finally {
			setLoading(null);
		}
	};

	const handleAddComment = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!comment.trim()) return;

		setLoading("comment");
		try {
			let response: Response;

			if (commentType === "question") {
				// Single atomic API call - updates status + adds comment in one transaction
				response = await fetch(`/api/tickets/${ticketId}/ask-question`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					credentials: 'include',
					body: JSON.stringify({
						question: comment.trim(),
					}),
				});
			} else {
				// Regular comment or internal note (no status change)
				const isInternalNote = commentType === "internal" || commentType === "super_admin";
				response = await fetch(`/api/tickets/${ticketId}/comments`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					credentials: 'include',
					body: JSON.stringify({
						comment: comment.trim(),
						is_internal: isInternalNote,
					}),
				});
			}

			if (response.ok) {
				setComment("");
				setShowCommentForm(false);
				setCommentType("comment");
				const message = commentType === "question"
					? "Question sent to student successfully"
					: "Comment added successfully";
				toast.success(message);
				// Cache invalidation happens server-side in API route
				// No router.refresh() needed - comment will appear on next navigation or natural refresh
			} else {
				const error = await response.json().catch(() => ({ error: "Failed to add comment" }));
				const errorMessage = typeof error.error === 'string' ? error.error : "Failed to add comment";
				toast.error(errorMessage);
			}
		} catch (error) {
			logger.error({ error, component: "AdminActions", action: "addComment" }, "Error adding comment");
			toast.error("Failed to add comment. Please try again.");
		} finally {
			setLoading(null);
		}
	};

	const handleMarkResolved = async (e?: React.FormEvent) => {
		if (e) {
			e.preventDefault();
		}

		// Optimistic update - update UI immediately
		setOptimisticStatus("RESOLVED");
		if (onStatusChanged) {
			onStatusChanged("RESOLVED");
		}
		setLoading("resolved");

		try {
			// Single atomic API call - resolves ticket + adds comment in one transaction
			const response = await fetch(`/api/tickets/${ticketId}/resolve`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				credentials: 'include',
				body: JSON.stringify({
					comment: resolveComment.trim() || undefined,
					commentVisibility: "public",
				}),
			});

			if (response.ok) {
				setResolveComment("");
				setShowResolveDialog(false);
				toast.success("Ticket marked as resolved");
				// Cache invalidation happens server-side in API route
				// No router.refresh() needed - optimistic update provides instant feedback
			} else {
				// Rollback optimistic update
				setOptimisticStatus(null);
				if (onStatusChanged) {
					onStatusChanged(currentStatus);
				}
				const error = await response.json().catch(() => ({ error: "Failed to mark ticket as resolved" }));
				const errorMessage = typeof error.error === 'string' ? error.error : "Failed to mark ticket as resolved";
				toast.error(errorMessage);
			}
		} catch (error) {
			// Rollback optimistic update
			setOptimisticStatus(null);
			if (onStatusChanged) {
				onStatusChanged(currentStatus);
			}
			logger.error({ error, component: "AdminActions", action: "markResolved" }, "Error marking ticket as resolved");
			toast.error("Failed to mark ticket as resolved. Please try again.");
		} finally {
			setLoading(null);
		}
	};

	// handleDelete function removed


	const handleForward = async (e: React.FormEvent) => {
		e.preventDefault();
		setLoading("forward");
		try {
			const body: Record<string, unknown> = { reason: forwardReason || undefined };
			if (selectedForwardAdmin && selectedForwardAdmin !== "auto") {
				body.targetUserId = selectedForwardAdmin;
			}

			const response = await fetch(`/api/tickets/${ticketId}/forward`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			if (response.ok) {
				const data = await response.json();
				setForwardReason("");
				setSelectedForwardAdmin("auto"); // FIX #7: Reset on submit, not in useEffect
				setShowForwardDialog(false);
				toast.success(data.message || "Ticket forwarded successfully");
				// FIX #4: Cache invalidation happens server-side in API route
				// No router.refresh() needed - optimistic update provides instant feedback
			} else {
				const error = await response.json().catch(() => ({ error: "Failed to forward ticket" }));
				const errorMessage = typeof error.error === 'string' ? error.error : "Failed to forward ticket";
				toast.error(errorMessage);
			}
		} catch (error) {
			logger.error({ error, component: "AdminActions", action: "forward", ticketId }, "Error forwarding ticket");
			toast.error("Failed to forward ticket. Please try again.");
		} finally {
			setLoading(null);
		}
	};

	// handleEscalate function removed

	return (
		<div className="border-t pt-4 space-y-4">
			<label className="text-sm font-medium text-muted-foreground block">
				👨‍💼 Admin Actions
			</label>

			<div className="flex flex-wrap gap-2">
				{normalizedStatus !== "in_progress" && normalizedStatus !== "awaiting_student" && (
					<Button
						variant="outline"
						onClick={handleMarkInProgress}
						disabled={loading !== null}
					>
						{loading === "mark" ? (
							<>
								<Loader2 className="w-4 h-4 mr-2 animate-spin" />
								Marking...
							</>
						) : (
							<>
								<RefreshCw className="w-4 h-4 mr-2" />
								Mark In Progress (48h TAT)
							</>
						)}
					</Button>
				)}

				{showCustomTat && (
					<form onSubmit={handleSetTAT} className="flex gap-2 items-end w-full sm:w-auto">
						<div className="flex-1">
							<Label htmlFor="tat">Turnaround Time (TAT)</Label>
							<Input
								id="tat"
								value={tat}
								onChange={(e) => setTat(e.target.value)}
								placeholder="e.g., 2 hours, 1 day, 3 days"
								required
							/>
						</div>
						<Button type="submit" disabled={loading === "tat"}>
							{loading === "tat" ? (
								<>
									<Loader2 className="w-4 h-4 animate-spin mr-2" />
									Setting...
								</>
							) : (
								"Update"
							)}
						</Button>
						<Button
							type="button"
							variant="ghost"
							onClick={() => {
								setShowCustomTat(false);
								setTat("");
							}}
						>
							Cancel
						</Button>
					</form>
				)}

				{/* Show Extend TAT button if already in progress with TAT */}
				{!showCustomTat && normalizedStatus === "in_progress" && hasTAT && (
					<Button
						variant="outline"
						onClick={() => {
							setTat("");
							setShowCustomTat(true);
						}}
					>
						<Clock className="w-4 h-4 mr-2" />
						Extend TAT
					</Button>
				)}

				{!showCustomTat && normalizedStatus !== "in_progress" && (
					<Button
						variant="ghost"
						onClick={() => {
							setTat("");
							setShowCustomTat(true);
						}}
						className="text-xs sm:text-sm"
					>
						Set custom TAT before starting
					</Button>
				)}

				{showCommentForm && (
					<form onSubmit={handleAddComment} className="space-y-2 flex-1 w-full">
						<div>
							<Label htmlFor="adminComment">
								{commentType === "internal"
									? "Internal Note"
									: commentType === "super_admin"
										? "Super Admin Note"
										: "Admin Comment"}
							</Label>
							<Textarea
								id="adminComment"
								value={comment}
								onChange={(e) => setComment(e.target.value)}
								placeholder={
									commentType === "internal"
										? "This note is visible only to admins and committees..."
										: "Enter your comment..."
								}
								rows={3}
								required
							/>
						</div>
						<div className="flex gap-2">
							<Button type="submit" disabled={loading === "comment"}>
								{loading === "comment" ? (
									<>
										<Loader2 className="w-4 h-4 animate-spin mr-2" />
										Sending...
									</>
								) : (
									commentType === "internal" ? "Save Note" : "Add Comment"
								)}
							</Button>
							<Button
								type="button"
								variant="ghost"
								onClick={() => {
									setShowCommentForm(false);
									setComment("");
									setCommentType("comment");
								}}
							>
								Cancel
							</Button>
						</div>
					</form>
				)}


				{/* Delete ticket removed for super admin */}

				{/* Internal Note Button */}
				<Button
					variant="outline"
					onClick={() => {
						setShowCommentForm(true);
						setCommentType("internal");
					}}
					disabled={loading !== null}
				>
					<FileText className="w-4 h-4 mr-2" />
					Internal Note
				</Button>

				{/* Reassign - only for super admin */}
				{isSuperAdmin && (
					<>
						<ReassignDialog
							open={showReassignDialog}
							onOpenChange={setShowReassignDialog}
							ticketId={ticketId}
							currentAssignedTo={currentAssignedTo}
							onReassigned={() => {
								// FIX #4: Cache invalidation happens server-side in API route
								// No router.refresh() needed - reassignment will appear on next navigation
							}}
						/>
						<Button
							variant="outline"
							disabled={loading !== null}
							onClick={() => setShowReassignDialog(true)}
						>
							<UserCog className="w-4 h-4 mr-2" />
							Reassign
						</Button>
					</>
				)}

				{/* Escalate Ticket removed */}

				{/* Forward to Next Level (always available) */}
				<Dialog open={showForwardDialog} onOpenChange={setShowForwardDialog}>
						<DialogTrigger asChild>
							<Button
								variant="outline"
								disabled={loading !== null}
							>
								<ArrowUpRight className="w-4 h-4 mr-2" />
								Forward
							</Button>
						</DialogTrigger>
						<DialogContent>
							<DialogHeader>
								<DialogTitle>Forward Ticket</DialogTitle>
								<DialogDescription>
									Forward this ticket to the next level admin for handling.
								</DialogDescription>
							</DialogHeader>
							<form onSubmit={handleForward} className="space-y-4">
								<div>
									<Label htmlFor="forwardReason">Reason (Optional)</Label>
									<Textarea
										id="forwardReason"
										value={forwardReason}
										onChange={(e) => setForwardReason(e.target.value)}
										placeholder="e.g., Requires senior admin approval, Beyond my scope..."
										rows={3}
									/>
								</div>
								<div className="space-y-2">
									<Label htmlFor="forwardTarget">Forward To</Label>
									{hasForwardTargets ? (
										<>
											<Select
												value={selectedForwardAdmin}
												onValueChange={setSelectedForwardAdmin}
												disabled={loading === "forward"}
											>
												<SelectTrigger id="forwardTarget">
													<SelectValue placeholder="Select admin or use auto-selection" />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="auto">Automatic (choose best super admin)</SelectItem>
													{forwardTargets.map((admin) => (
														<SelectItem key={admin.id} value={admin.id}>
															<span className="flex flex-col">
																<span className="font-medium">{admin.name}</span>
																<span className="text-xs text-muted-foreground">{admin.email || "No email"}</span>
															</span>
														</SelectItem>
													))}
												</SelectContent>
											</Select>
											<p className="text-xs text-muted-foreground">
												Leave on <span className="font-medium">Automatic</span> to let the system pick the next-level (super admin) automatically.
											</p>
										</>
									) : (
										<p className="text-sm text-muted-foreground">
											This will forward to the default super admin assigned for escalations.
										</p>
									)}
								</div>
								<DialogFooter>
									<Button
										type="button"
										variant="outline"
										onClick={() => {
											setShowForwardDialog(false);
											setForwardReason("");
											setSelectedForwardAdmin("auto");
										}}
									>
										Cancel
									</Button>
									<Button type="submit" disabled={loading === "forward"}>
										{loading === "forward" ? (
											<>
												<Loader2 className="w-4 h-4 animate-spin mr-2" />
												Forwarding...
											</>
										) : (
											"Forward"
										)}
									</Button>
								</DialogFooter>
							</form>
						</DialogContent>
					</Dialog>


				{/* Mark as Resolved */}
				{normalizedStatus !== "resolved" && (
					<>
						<Button
							variant="default"
							onClick={() => setShowResolveDialog(true)}
							disabled={loading !== null}
							className="bg-green-600 hover:bg-green-700 text-white"
						>
							<CheckCircle className="w-4 h-4 mr-2" />
							Mark as Resolved
						</Button>
						<Dialog open={showResolveDialog} onOpenChange={setShowResolveDialog}>
							<DialogContent>
							<DialogHeader>
								<DialogTitle>Mark Ticket as Resolved</DialogTitle>
								<DialogDescription>
									Are you sure you want to mark this ticket as resolved? You can optionally add a comment.
								</DialogDescription>
							</DialogHeader>
							<form onSubmit={handleMarkResolved} className="space-y-4">
								<div>
									<Label htmlFor="resolveComment">Comment (Optional)</Label>
									<Textarea
										id="resolveComment"
										value={resolveComment}
										onChange={(e) => setResolveComment(e.target.value)}
										placeholder="Add a comment explaining the resolution..."
										rows={4}
									/>
								</div>
								<DialogFooter>
									<Button
										type="button"
										variant="outline"
										onClick={() => {
											setShowResolveDialog(false);
											setResolveComment("");
										}}
										disabled={loading === "resolved"}
									>
										Cancel
									</Button>
									<Button 
										type="submit" 
										disabled={loading === "resolved"}
										className="bg-green-600 hover:bg-green-700 text-white"
									>
										{loading === "resolved" ? (
											<>
												<Loader2 className="w-4 h-4 animate-spin mr-2" />
												Marking...
											</>
										) : (
											<>
												<CheckCircle className="w-4 h-4 mr-2" />
												Mark as Resolved
											</>
										)}
									</Button>
								</DialogFooter>
							</form>
						</DialogContent>
					</Dialog>
					</>
				)}
			</div>
		</div>
	);
}
