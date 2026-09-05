<#
RUN ONE COMMAND WITH THE SUPABASE CLI'S OWN ACCESS TOKEN IN ITS ENVIRONMENT.

WHY THIS EXISTS. The types-drift guard (scripts/ci/types-drift-guard.mjs) can
generate types with the CLI's stored login, but to tell PENDING MIGRATIONS apart
from STALE TYPES it must list the migrations the target has applied, and that
Management API call reads SUPABASE_ACCESS_TOKEN from the environment. On this
machine nothing sets it: `supabase login` stores the token in Windows Credential
Manager under "Supabase CLI:supabase" and no shell profile exports it. So every
local run of the guard that found ANY difference failed with "token is not set",
and the guard was only ever judged by CI, which is exactly the habit the
5 September 2026 close-out forbids (six failed-run emails for one pull request).

WHAT IT DOES. Reads the credential the CLI already holds, proves it against the
Management API (a revoked token is reported as a revoked token, never as drift,
the same distinction the CI job draws), sets it for the child process ONLY, runs
the command, and returns the command's own exit code.

THE TOKEN IS NEVER PRINTED, never written to a file, never passed as an argument
(an argument lands in shell history), and never left in the calling shell.

Usage, from the repository root in PowerShell:

  scripts\ops\with-supabase-token.ps1 node scripts/ci/types-drift-guard.mjs
  scripts\ops\with-supabase-token.ps1 bash scripts/check-types-drift.sh

Any command works; the first argument is the program, the rest are its arguments.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true, Position = 0)]
  [string]$Program,
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$Arguments
)

$ErrorActionPreference = 'Stop'

$credentialTarget = 'Supabase CLI:supabase'

if (-not ('SupabaseCliCredential' -as [type])) {
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class SupabaseCliCredential
{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct CREDENTIAL
    {
        public uint Flags;
        public uint Type;
        public string TargetName;
        public string Comment;
        public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
        public uint CredentialBlobSize;
        public IntPtr CredentialBlob;
        public uint Persist;
        public uint AttributeCount;
        public IntPtr Attributes;
        public string TargetAlias;
        public string UserName;
    }

    [DllImport("advapi32.dll", EntryPoint = "CredReadW", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool CredRead(string target, uint type, uint flags, out IntPtr credential);

    [DllImport("advapi32.dll")]
    private static extern void CredFree(IntPtr credential);

    public static string Read(string target)
    {
        IntPtr handle;
        if (!CredRead(target, 1, 0, out handle)) return null;
        try
        {
            CREDENTIAL c = (CREDENTIAL)Marshal.PtrToStructure(handle, typeof(CREDENTIAL));
            byte[] blob = new byte[c.CredentialBlobSize];
            Marshal.Copy(c.CredentialBlob, blob, 0, blob.Length);
            string value = Encoding.UTF8.GetString(blob);
            if (value.IndexOf('\0') >= 0) value = Encoding.Unicode.GetString(blob);
            return value.Trim();
        }
        finally
        {
            CredFree(handle);
        }
    }
}
'@
}

$token = [SupabaseCliCredential]::Read($credentialTarget)
if (-not $token) {
  Write-Error "[with-supabase-token] REFUSED: no credential named '$credentialTarget' in Windows Credential Manager. Run 'npx supabase login' once, then retry."
  exit 2
}

# PRESENT is not VALID. Exercise it before handing it to anything, so an expired
# token is named as such instead of surfacing as a generic failure downstream.
try {
  $probe = Invoke-WebRequest -Uri 'https://api.supabase.com/v1/projects' -Headers @{ Authorization = "Bearer $token" } -UseBasicParsing -TimeoutSec 30
  $status = [int]$probe.StatusCode
} catch {
  $status = 0
  if ($_.Exception.Response) { $status = [int]$_.Exception.Response.StatusCode }
}
if ($status -eq 401 -or $status -eq 403) {
  Write-Error "[with-supabase-token] REFUSED: the stored token is PRESENT but REJECTED by Supabase (HTTP $status). It has expired or been revoked. Run 'npx supabase login' again. This is NOT schema drift."
  exit 2
}
if ($status -ne 200) {
  Write-Warning "[with-supabase-token] unexpected HTTP $status from the Supabase API while validating the token; continuing."
} else {
  Write-Host "[with-supabase-token] token accepted by the Supabase API (HTTP 200, length $($token.Length)); running: $Program $($Arguments -join ' ')"
}

$previous = $env:SUPABASE_ACCESS_TOKEN
try {
  $env:SUPABASE_ACCESS_TOKEN = $token
  # The child's stderr is ITS output, not an error in this script. Under
  # 'Stop', Windows PowerShell 5.1 wraps every stderr line of a native command
  # in an ErrorRecord and terminates on the first one, so a harmless Node
  # deprecation warning would abort the guard before it ran. Only the child's
  # exit code decides the outcome.
  $ErrorActionPreference = 'Continue'
  & $Program @Arguments
  $code = $LASTEXITCODE
  $ErrorActionPreference = 'Stop'
} finally {
  if ($null -eq $previous) { Remove-Item Env:SUPABASE_ACCESS_TOKEN -ErrorAction SilentlyContinue } else { $env:SUPABASE_ACCESS_TOKEN = $previous }
  $token = $null
}
exit $code
