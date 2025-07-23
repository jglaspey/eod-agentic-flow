# Supabase Storage Setup Instructions

To enable PDF download functionality, you need to set up storage in your Supabase project.

## Option 1: Use Supabase Storage (Recommended for Production)

1. Go to your Supabase Dashboard
2. Navigate to Storage section
3. Create a new bucket called `job-pdfs`
4. Set the bucket to private (not public)
5. Update your environment variables to include storage permissions

## Option 2: Base64 Storage in Database (Current Implementation)

For now, we're storing PDFs as base64 in the database. This works for small files but has limitations:
- Maximum file size depends on your database row size limits
- Not ideal for production use with many/large files
- But works immediately without additional setup

## Future Migration

When ready to migrate to proper storage:
1. Set up the storage bucket as described above
2. Run the migration script (to be created) to move base64 PDFs to storage
3. Update the code to use storage URLs instead of base64

## Current Implementation

The system currently stores PDFs as base64 in the `jobs` table using the existing `estimate_pdf_url` and `roof_report_pdf_url` columns. These columns store data URLs (data:application/pdf;base64,...) that can be directly used for downloads.