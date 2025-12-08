"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Download, Upload, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { AriaLiveRegion } from "@/lib/ui/aria-live-region";

interface ValidationError {
	row: number;
	field: string;
	message: string;
	value?: unknown;
}

interface UploadResult {
	success: boolean;
	created: number;
	updated: number;
	skipped: number;
	errors: ValidationError[];
	summary: string;
}

export function StudentBulkUpload() {
	const [file, setFile] = useState<File | null>(null);
	const [uploading, setUploading] = useState(false);
	const [result, setResult] = useState<UploadResult | null>(null);
	const [errors, setErrors] = useState<ValidationError[]>([]);

	const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const selectedFile = e.target.files?.[0];
		if (selectedFile) {
			setFile(selectedFile);
			setResult(null);
			setErrors([]);
		}
	};

	const downloadTemplate = async () => {
		try {
			const response = await fetch("/api/superadmin/students/csv-template");
			if (!response.ok) {
				throw new Error("Failed to download template");
			}

			const blob = await response.blob();
			const url = window.URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = "student_upload_template.csv";
			document.body.appendChild(a);
			a.click();
			window.URL.revokeObjectURL(url);
			document.body.removeChild(a);
		} catch (error) {
			console.error("Template download error:", error);
			alert("Failed to download template");
		}
	};

	const [uploadProgress, setUploadProgress] = useState(0);

	const handleUpload = async () => {
		if (!file) return;

		setUploading(true);
		setResult(null);
		setErrors([]);
		setUploadProgress(0);

		try {
			const formData = new FormData();
			formData.append("file", file);

			// Use XMLHttpRequest for upload progress tracking
			const xhr = new XMLHttpRequest();
			
			const data = await new Promise<UploadResult>((resolve, reject) => {
				xhr.upload.addEventListener("progress", (e) => {
					if (e.lengthComputable) {
						const percentComplete = Math.round((e.loaded / e.total) * 100);
						setUploadProgress(percentComplete);
					}
				});

				xhr.addEventListener("load", () => {
					try {
						const contentType = xhr.getResponseHeader("content-type");
						if (!contentType || !contentType.includes("application/json")) {
							reject(new Error(`Server returned non-JSON response (${xhr.status} ${xhr.statusText})`));
							return;
						}
						const responseData = JSON.parse(xhr.responseText);
						
						// Handle both success and error responses (400, 207, etc. may still have data)
						if (xhr.status >= 200 && xhr.status < 300) {
							resolve(responseData);
						} else if (xhr.status === 400 || xhr.status === 207) {
							// 400 = validation errors, 207 = partial success
							// These responses contain the result data with errors
							resolve(responseData);
						} else {
							reject(new Error(responseData.error || `Upload failed: ${xhr.status}`));
						}
					} catch (parseError) {
						reject(new Error("Failed to parse response"));
					}
				});

				xhr.addEventListener("error", () => {
					reject(new Error("Upload failed"));
				});

				xhr.open("POST", "/api/superadmin/students/bulk-upload");
				xhr.send(formData);
			});

			setResult(data);
			setErrors(data.errors || []);
			
			// Clear file input only on full success (no errors)
			if (data.success && (!data.errors || data.errors.length === 0)) {
				setFile(null);
				const input = document.getElementById("csv-upload") as HTMLInputElement;
				if (input) input.value = "";
			}
		} catch (error) {
			console.error("Upload error:", error);
			alert("Failed to upload file");
		} finally {
			setUploading(false);
		}
	};

	return (
		<div className="space-y-6">
			<AriaLiveRegion
				loading={uploading}
				loadingMessage={uploadProgress < 100 ? `Uploading file... ${uploadProgress}%` : "Processing CSV file..."}
				success={result?.success ? `Upload successful! Created ${result.created}, updated ${result.updated} students.` : false}
				error={errors.length > 0 ? `Upload failed with ${errors.length} validation errors.` : false}
			/>
			<Card>
				<CardHeader>
					<CardTitle>Bulk Upload Students</CardTitle>
					<CardDescription>
						Upload a CSV file to create or update multiple student profiles at once.
						All fields are mapped by email address (unique identifier).
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					{/* Download Template */}
					<div className="flex items-center justify-between p-4 border rounded-lg">
						<div>
							<p className="font-medium">1. Download CSV Template</p>
							<p className="text-sm text-muted-foreground">
								Get the template with correct headers and example data
							</p>
						</div>
						<Button onClick={downloadTemplate} variant="outline" size="sm">
							<Download className="w-4 h-4 mr-2" />
							Download Template
						</Button>
					</div>

					{/* File Upload */}
					<div className="flex items-center justify-between p-4 border rounded-lg">
						<div className="flex-1">
							<p className="font-medium mb-2">2. Upload Filled CSV</p>
							<input
								id="csv-upload"
								type="file"
								accept=".csv"
								onChange={handleFileChange}
								className="block w-full text-sm text-muted-foreground
									file:mr-4 file:py-2 file:px-4
									file:rounded-md file:border-0
									file:text-sm file:font-semibold
									file:bg-primary file:text-primary-foreground
									hover:file:bg-primary/90
									cursor-pointer"
							/>
							{file && (
								<p className="text-sm text-muted-foreground mt-2">
									Selected: {file.name} ({(file.size / 1024).toFixed(2)} KB)
								</p>
							)}
						</div>
					</div>

					{/* Upload Button */}
					<div className="flex justify-end">
						<Button onClick={handleUpload} disabled={!file || uploading} size="lg">
							{uploading ? (
								<>
									<AlertCircle className="w-4 h-4 mr-2 animate-spin" />
									Uploading...
								</>
							) : (
								<>
									<Upload className="w-4 h-4 mr-2" />
									Upload & Process
								</>
							)}
						</Button>
					</div>

					{/* Upload Progress */}
					{uploading && (
						<div className="space-y-2">
							<Progress value={uploadProgress} className="w-full" />
							<p className="text-sm text-muted-foreground text-center">
								{uploadProgress < 100 
									? `Uploading... ${uploadProgress}%`
									: "Processing CSV file..."}
							</p>
						</div>
					)}
				</CardContent>
			</Card>

			{/* Success Result */}
			{result && result.success && (
				<Alert className="border-green-500 bg-green-50 dark:bg-green-950">
					<CheckCircle2 className="h-4 w-4 text-green-600" />
					<AlertDescription className="ml-2">
						<div className="space-y-2">
							<p className="font-semibold text-green-900 dark:text-green-100">
								Upload Successful!
							</p>
							<div className="text-sm text-green-800 dark:text-green-200 space-y-1">
								<p>✓ Created: {result.created} new students</p>
								<p>✓ Updated: {result.updated} existing students</p>
								{result.skipped > 0 && <p>⚠ Skipped: {result.skipped} rows</p>}
							</div>
						</div>
					</AlertDescription>
				</Alert>
			)}

			{/* Validation Errors */}
			{errors.length > 0 && (
				<Alert variant="destructive">
					<XCircle className="h-4 w-4" />
					<AlertDescription className="ml-2">
						<div className="space-y-2">
							<p className="font-semibold">Validation Errors ({errors.length})</p>
							<div className="text-sm space-y-1 max-h-64 overflow-y-auto">
								{errors.slice(0, 20).map((error, index) => (
									<p key={index}>
										Row {error.row}, Field &quot;{error.field}&quot;: {error.message}
										{error.value !== undefined && error.value !== null && ` (Value: &quot;${String(error.value)}&quot;)`}
									</p>
								))}
								{errors.length > 20 && (
									<p className="font-semibold mt-2">
										... and {errors.length - 20} more errors
									</p>
								)}
							</div>
						</div>
					</AlertDescription>
				</Alert>
			)}

			{/* CSV Format Guidelines */}
			<Card>
				<CardHeader>
					<CardTitle className="text-base">CSV Format Guidelines</CardTitle>
				</CardHeader>
				<CardContent className="text-sm space-y-2">
					<div>
						<p className="font-medium">Required Fields:</p>
						<ul className="list-disc list-inside text-muted-foreground ml-2">
							<li><strong>email</strong> - Must be unique and valid format</li>
							<li><strong>full_name</strong> - Student&apos;s complete name</li>
							<li><strong>mobile</strong> - 10-15 digit phone number</li>
							<li><strong>hostel</strong> - Must match an active hostel name (case-insensitive) OR use hostel_id</li>
							<li><strong>class_section</strong> - Must match an active class section name (e.g., A, B, C, D) OR use class_section_id</li>
							<li><strong>batch_year</strong> - Year (e.g., 2027) - Must match an active batch OR use batch_id</li>
						</ul>
					</div>
					<div className="pt-2">
						<p className="font-medium">Optional Fields:</p>
						<ul className="list-disc list-inside text-muted-foreground ml-2">
							<li>roll_no - Student roll number</li>
							<li>room_number - Room number (max 16 chars)</li>
							<li>department - Department name</li>
							<li>blood_group - One of A+, A-, B+, B-, O+, O-, AB+, AB-</li>
							<li>parent_name - Parent/guardian name</li>
							<li>parent_phone - Parent/guardian phone (10-15 digits)</li>
						</ul>
					</div>
					<div className="pt-2 border-t">
						<p className="font-medium text-amber-600 dark:text-amber-400">
							⚠ Important Notes:
						</p>
						<ul className="list-disc list-inside text-muted-foreground ml-2">
							<li>Existing students will be updated based on email match</li>
							<li>New students will be created if email doesn&apos;t exist</li>
							<li>All data is validated before processing</li>
							<li>Students can only edit mobile number after creation</li>
						</ul>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
