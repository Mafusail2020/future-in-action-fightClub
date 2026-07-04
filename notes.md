1. Hackathon goal
Goal of the hackathon is to develop an solution to improve cities, improve city life and to make cities more efficient.  

2. Our idea
Our idea is to create an aggregator which will collect all existing solutions from all cities around the world. Instead of developing 1 solution, we collect all existing solution and match relevant ones to the user's city. Solutions can range anywhere from AI to robotics, from electricity to policies on car driving to reduce car crashes etc. Our app will allow cities' governments to efficienly use experience of other cities and to filter all existing solution to find one which will be useful for them.

3. Technical side (backend)
    1. Collect all existing relevant data about solutions in cities which improve efficiency / quality of life etc. Especially form European cities.
    2. Save all data in supabase.
    3. Build agent which will create a profile of a city where user is from and give relevant solution from other cities which match the profile of user's city problems.
    4. Each solution has to be in one of the groups by type (e.g. traffic, heating etc).
    5. Each solution should belong to a city, city will have a coordinate to be displayed on a map in frontend.
    6. Data source is pre-selected and lives on subabase, it is not live, it is static

4. Technical side (frontend)
    >Frontend is being implemented on separate branch by teammate, it will be wired up later
    1. World map (glove view) which will show all the cities in which there are solutions. When user clicks on a city, windows with solution in this city will pop up.
    2. When user clicks on a solution, separate tab will open with details about that solution.
    3. AI-assistant chat on the right (same style as cursor or vscode copilot AI integration).
    4. Another tab with a profile of a city where user is from.