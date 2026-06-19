# Install Twellie on a 2014 H-series Orsay TV from macOS

1. Download the installer for [⬇️ Apple Silicon](/releases/latest/download/twellie-orsay-host-macos-arm64.zip) or [⬇️ Intel](/releases/latest/download/twellie-orsay-host-macos-x64.zip).
2. Unzip the file on the Mac.
3. Double-click `Install-Twellie.command`.
4. In the **"Install-Twellie.command" Not Opened** dialog, click **Done**.
5. Open **System Settings** on the Mac.
6. Open **Privacy & Security**.
7. Scroll to **Security**.
8. Click **Open Anyway** for `Install-Twellie.command`.
9. Enter your Mac password or approve with Touch ID.
10. Click **Open**.
11. Enter your Mac password when Terminal asks. The installer needs port 80 for Orsay App Sync.
12. Leave the installer window open and note the IP address it prints.
13. On the TV, press **Menu**.
14. Go to **Smart Hub** -> **Samsung Account** -> **Log In**.
15. Enter `develop` as the account name, enter `000000` as the password, and confirm the login.
16. Open **Smart Hub**.
17. Highlight any installed app.
18. Press and hold **OK/Enter** for about 5 seconds.
19. Choose **IP Setting**.
20. Enter the IP address from step 12 and confirm.
21. Highlight any installed app again.
22. Press and hold **OK/Enter** for about 5 seconds.
23. Choose **Start User App Sync**.
24. Wait for the TV to show **Service installed**.
25. Open **Twellie** from Smart Hub.
26. Close the installer window on the Mac.
