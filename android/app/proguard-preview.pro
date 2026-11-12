# Preview build type only (lk.motormila.app.debug sideload). Shrink + optimize
# like release, but keep names: the CI-generated Baseline Profile
# (app/src/main/baseline-prof.txt) is written against source names, and
# preview crash traces stay readable for testers.
-dontobfuscate
