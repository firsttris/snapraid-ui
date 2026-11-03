// Entry point of the standalone binary (scripts/build-binary.sh): the backend with the built
// frontend and the documentation inside, configured by the same environment variables as the image.
// Both imports are static and bin-cli.ts comes first: imported dynamically, the bundle of main.ts
// would set up tsyringe (@simplewebauthn/server) before the reflect-metadata it needs
import "./bin-cli.ts";
import "./main.ts";
