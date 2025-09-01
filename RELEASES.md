# Release Notes

All notable changes to Brewprints.io are documented here. This project follows [Semantic Versioning](https://semver.org/).

## v1.0.2 - 2025-09-01

### What's New
- Refined typography and color theme across app
- Complete production deployment system with dependency injection
- Add header logo navigation with authentication-based routing
- Dynamic page titles for better PDF filenames

### Improvements
- Add performance monitoring and reliability fixes
- Implement comprehensive performance optimization reducing load time by 60%

### Bug Fixes
- Load Clerk configuration before script initialization
- Resolve console warnings and optimize database performance
- Resolve XSS vulnerabilities and syntax error in production security fixes
- Update README to reflect actual app flow
- Improve data preview print styles and UI refinements
- fix: hide version info from print output
- Replace emoji avatar with Lucide icon
- Prevent Firebase config caching issues

---

## v1.0.1 - 2025-08-28

### Behind the Scenes

This release focuses on improving our development and release processes. While these changes don't directly affect the application's functionality, they help us deliver better updates more efficiently.

- Secured Firebase configuration by moving sensitive settings to cloud functions
- Integrated Claude AI to automatically generate contextual release notes
- Implemented automated system to maintain RELEASES.md documentation file
- Added release preparation workflow to streamline version management process

---

## v1.0.0 - 2025-08-26

### Initial Release

Brewprints.io transforms your digital beer recipes into organized, printable brew day sheets.

### What It Does

- **Imports recipes** from BeerXML, BeerJSON, and Brewfather
- **Creates printable brew logs** with all your recipe details
- **Calculates key metrics** like IBU, SRM, and ABV
- **Provides measurement tracking** sections for brew day observations
- **Works on any device** with a modern web browser

### Getting Started

Simply drag and drop your recipe file, preview the formatted output, and print your brew day sheet. No installation or account required.

---

## Future Releases

Future releases will be documented here as they are published. Each release will include:
- New features and enhancements
- Bug fixes and improvements
- Any breaking changes or migration notes

For the latest development updates, visit [github.com/soren-creates/brewprints-io](https://github.com/soren-creates/brewprints-io).
