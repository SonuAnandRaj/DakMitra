# DakMitra
A lightning-fast, offline-capable PWA to bulk-upload, manage, and fuzzy-search post office branch and sub-office networks with voice search support.
# 📬 DakMitra (Post Office Directory PWA)

A modern, responsive Progressive Web Application (PWA) built with Vanilla HTML/CSS/JavaScript and powered by Supabase. Designed for speed and offline capability, it allows users to securely upload branch and sub-office data via Excel sheets and perform instant fuzzy searches.

## ✨ Key Features

* **🔐 Secure Authentication**: Email/password sign-up and session persistence via Supabase Auth.
* **📊 Excel Bulk Upload**: Seamlessly parse `.xlsx` or `.xls` files using SheetJS and push records directly to Supabase.
* **⚡ Lightning-Fast Fuzzy Search**: Powered by Fuse.js to instantly filter through records with tolerance for minor spelling mistakes.
* **🎤 Voice Search**: Integrated Web Speech API support for hands-free local voice searching.
* **🌓 Adaptive Theme Toggle**: Persistent Light, Dark, and System theme preferences.
* **📱 Responsive & PWA Ready**: Fully installable on mobile and desktop devices with offline caching via Service Workers.
* **📋 Data Management Tools**: Quick summary stats, list/table view toggles, and instant CSV export/copy capabilities.

## 🛠️ Tech Stack

* **Frontend**: Vanilla HTML5, CSS3 (Custom Properties), JavaScript (ES6+)
* **Backend / DB**: Supabase (Auth + PostgreSQL)
* **Libraries**: SheetJS (Excel Parsing), Fuse.js (Fuzzy Matching)
