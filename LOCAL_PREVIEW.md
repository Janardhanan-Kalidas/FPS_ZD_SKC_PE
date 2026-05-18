# Local Zendesk Theme Preview

You can preview this Zendesk theme directly from VS Code by using the installed Zendesk CLI.

## Prerequisites

- `zcli` installed locally
- Access to the target Zendesk Help Center
- Permission to preview themes in that Zendesk instance

This machine already has `zcli` installed.

## First-time setup

Authenticate once with Zendesk:

```bash
zcli login -i
```

That opens the interactive login flow and stores your auth token in the Zendesk CLI profile.

## Preview from VS Code

This repo now includes VS Code tasks in `.vscode/tasks.json`.

Open the command palette and run:

- `Tasks: Run Task`
- choose `Zendesk: Login` if you have not authenticated yet
- choose `Zendesk: Preview Theme` to start preview mode

You can also use the Run and Debug sidebar:

- open `Run and Debug`
- choose `Zendesk: Preview Theme`press
- press the start button

The preview command watches the current theme folder and pushes local changes to Zendesk preview mode.

## Helpful tasks

- `Zendesk: Login`
- `Zendesk: Preview Theme`
- `Zendesk: List Themes`

## Helpful launch shortcuts

- `Zendesk: Login`
- `Zendesk: Preview Theme`
- `Zendesk: List Themes`

## Notes

- The preview is not a standalone local web server. Zendesk renders the preview remotely using your local theme files.
- Any push from VS Code to GitLab is unrelated to preview mode.
- If the preview fails, run `Zendesk: Login` again and then retry `Zendesk: Preview Theme`.
- If you work against more than one Zendesk instance, use the CLI profile that matches the target subdomain.

## Terminal alternative

If you prefer the terminal inside VS Code, run:

```bash
zcli login -i
zcli themes:preview
```

## Troubleshooting

### Preview page won't load / "Page not found"

**Symptom**: Preview URL opens but returns a blank page or "not found" error, or the custom Help Center domain (`help.profisengineering.hilti.com`) doesn't resolve.

**Root cause**: The custom Help Center domain may not be resolvable from your local network or DNS configuration. This is a network/DNS issue, **not a theme compilation issue**. The theme uploads successfully (check for "Ok" in the terminal), but the preview can't authenticate to the custom domain.

**Solutions**:

1. **Switch to Google Public DNS** (recommended quick fix):
   - Go to **System Preferences** → **Network** → **Wi-Fi** → **Advanced**
   - **DNS Servers** tab
   - Remove your current DNS servers
   - Add: `8.8.8.8` and `8.8.4.4` (Google Public DNS)
   - Click **OK** and reconnect to Wi-Fi
   - Try the preview URL again

2. **Flush local DNS cache**:
   ```bash
   sudo dscacheutil -flushcache
   ```

3. **Test domain resolution**:
   ```bash
   nslookup help.profisengineering.hilti.com
   ```
   - If you see `** server can't find help.profisengineering.hilti.com: NXDOMAIN`, your DNS cannot resolve the custom domain
   - Try again after switching DNS providers

4. **Check if you're behind a corporate firewall/VPN**:
   - The custom Help Center domain may require VPN access from external networks
   - Connect to your corporate VPN and retry
   - Contact IT if the domain still doesn't resolve on VPN

5. **Verify primary domain works** (sanity check):
   ```bash
   nslookup hiltiprofisengineering.zendesk.com
   ```
   - Should return IPs like `216.198.54.11` or `216.198.53.11`
   - If this fails, you have a general connectivity issue

**After you fix DNS**: Restart the preview:
```bash
# Kill the current preview (Ctrl+C or run this in another terminal)
# Then restart
zcli themes:preview
```