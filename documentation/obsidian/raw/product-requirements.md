# Product requirements — Who's free, gdmit

This immutable source records the initial product brief.

- The product helps a group find a time when all or most people are free.
- A creator presses “Making a legit plan..” and receives a unique five-character plan code.
- A participant joins by entering the plan code in “Plan ID num”.
- The room opens on the current month in the participant's local timezone.
- Double-clicking a day opens 24 one-hour boxes. Selected boxes represent busy hours.
- Escape returns from the hourly editor to the month schedule.
- A day changes color when its busy hours change.
- After confirmation, the room ranks days and hours with the fewest busy members.
- The considered time span is the intersection of all members' boundaries.
- The visual direction is fruitiger aero, Y2K, Memphis design, heavy cel-shading, and floaty UI.
- The deployment target is Vercel, the durable database is MongoDB, and room updates are real-time.

## Clarifications adopted by the architecture

- Each member's first and last saved day define that member's planning window.
- A day saved with no busy hours means the member is fully free that day.
- Calendar dates and hours are entered in the member's IANA timezone, then normalized to UTC for matching.
