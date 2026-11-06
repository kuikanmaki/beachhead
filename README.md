# Beachhead

Build a top-down 2D browser tower defense game, where the Player is a commander holding a Klendathu-style beachhead against hostile arachnid swarms (classic TD + They Are Billions horde pressure + Starship Troopers expendable infantry).

Game starts by Player landing his first Infantry platoon on the auto-generated map / surface. This causes the arachnid swarms to begin to attack (they spawn from the edges and path toward the landing zone core). The map includes ridges, narrow passes, and high-ground positions, where player can station the infantry on chokepoints and elevated spots to hold the swarm. Infantry platoons auto-fight in the positions but die fast (sacrificial delay tools). While the infantry units fight, player uses engineering units to build strategically positioned automated machine-gun towers (permanent defense). Game is lost if all units are lost. Game is won when no infantry has died for a sustained period (defenses alone are holding due to the building of permanent defenses).

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/c6309caa-6a7b-496d-9fa2-8135284ac63c).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
