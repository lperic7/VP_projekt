import pandas as pd
import os

os.makedirs('podaci', exist_ok=True)

# učitavanje
results = pd.read_csv('results.csv')
races = pd.read_csv('races.csv')
drivers = pd.read_csv('drivers.csv')
constructors = pd.read_csv('constructors.csv')

# spajanje tablica
df = (results
      .merge(races[['raceId', 'year']], on='raceId')
      .merge(drivers[['driverId', 'forename', 'surname', 'nationality']], on='driverId')
      .merge(constructors[['constructorId', 'name']], on='constructorId'))

df['position'] = pd.to_numeric(df['position'], errors='coerce')
df['is_win'] = (df['position'] == 1).astype(int)
df['is_podium'] = (df['position'] <= 3).astype(int)
df['driver_name'] = df['forename'] + ' ' + df['surname']

# f1_drivers_history.json
drv = (df.groupby(['year', 'driver_name', 'nationality'])
         .agg(wins_year=('is_win', 'sum'),
              podiums_year=('is_podium', 'sum'),
              races_year=('raceId', 'nunique'))
         .reset_index()
         .sort_values(['driver_name', 'year']))

drv['cumulative_wins'] = drv.groupby('driver_name')['wins_year'].cumsum()
drv['cumulative_podiums'] = drv.groupby('driver_name')['podiums_year'].cumsum()
drv['cumulative_races'] = drv.groupby('driver_name')['races_year'].cumsum()

# zadržavanje samo vozača koji su ikad pobijedili
winners = drv.groupby('driver_name')['cumulative_wins'].max()
drv = drv[drv['driver_name'].isin(winners[winners > 0].index)]

drv[['year', 'driver_name', 'nationality',
     'wins_year', 'cumulative_wins',
     'podiums_year', 'cumulative_podiums',
     'cumulative_races']].to_json('podaci/f1_drivers_history.json',
                                  orient='records', indent=2)

print(f"[1/3] f1_drivers_history.json → {len(drv)} redaka")

# f1_teams_history.json
team = (df.groupby(['year', 'name'])
          .agg(wins_year=('is_win', 'sum'))
          .reset_index()
          .rename(columns={'name': 'team_name'})
          .sort_values(['team_name', 'year']))

team['cumulative_wins'] = team.groupby('team_name')['wins_year'].cumsum()

team_winners = team.groupby('team_name')['cumulative_wins'].max()
team = team[team['team_name'].isin(team_winners[team_winners > 0].index)]

team[['year', 'team_name', 'wins_year', 'cumulative_wins']].to_json(
    'podaci/f1_teams_history.json', orient='records', indent=2)

print(f"[2/3] f1_teams_history.json → {len(team)} redaka")

# f1_driver_stats.json
poles_raw = results.copy()
poles_raw['grid'] = pd.to_numeric(poles_raw['grid'], errors='coerce')
poles_raw['is_pole'] = (poles_raw['grid'] == 1).astype(int)

poles = (poles_raw
         .merge(drivers[['driverId', 'forename', 'surname']], on='driverId')
         .assign(driver_name=lambda x: x['forename'] + ' ' + x['surname'])
         .groupby('driver_name')['is_pole'].sum()
         .reset_index()
         .rename(columns={'is_pole': 'pole_positions'}))

# naslovi – vozač koji je bio prvak u sezoni  
try:
    ds = pd.read_csv('driver_standings.csv')
    ds = ds.merge(races[['raceId', 'year']], on='raceId')
    ds = ds.merge(drivers[['driverId', 'forename', 'surname']], on='driverId')
    ds['driver_name'] = ds['forename'] + ' ' + ds['surname']
    # zadnji round svake sezone
    last_round = ds.groupby('year')['raceId'].max().reset_index()
    ds_last = ds.merge(last_round, on=['year', 'raceId'])
    champions = (ds_last[ds_last['position'] == 1]
                 .groupby('driver_name')['year'].count()
                 .reset_index()
                 .rename(columns={'year': 'championships'}))
except FileNotFoundError:
    champions = pd.DataFrame(columns=['driver_name', 'championships'])
    print("  ⚠  driver_standings.csv nije pronađen – naslovi će biti 0")

# consistency = % utrka gdje je vozač stigao u cilj (statusCode ≈ Finished)
results_status = results.copy()
try:
    status = pd.read_csv('status.csv')
    results_status = results_status.merge(status, on='statusId')
    results_status = results_status.merge(
        drivers[['driverId', 'forename', 'surname']], on='driverId')
    results_status['driver_name'] = (results_status['forename'] + ' '
                                     + results_status['surname'])
    results_status['finished'] = results_status['status'].str.lower().str.contains('finished').astype(int)
    consistency = (results_status
                   .groupby('driver_name')
                   .agg(races=('raceId', 'nunique'), finished=('finished', 'sum'))
                   .assign(consistency=lambda x: (x['finished'] / x['races'] * 100).round(1))
                   .reset_index()[['driver_name', 'consistency']])
except FileNotFoundError:
    consistency = pd.DataFrame(columns=['driver_name', 'consistency'])
    print("  ⚠  status.csv nije pronađen – consistency će biti 0")

# lifetime wins & podiums
lifetime = (drv.groupby('driver_name')
               .agg(wins=('cumulative_wins', 'max'),
                    podiums=('cumulative_podiums', 'max'))
               .reset_index())

stats = (lifetime
         .merge(poles, on='driver_name', how='left')
         .merge(champions, on='driver_name', how='left')
         .merge(consistency, on='driver_name', how='left')
         .fillna(0))

stats['championships'] = stats['championships'].astype(int)
stats['pole_positions'] = stats['pole_positions'].astype(int)

stats.to_json('podaci/f1_driver_stats.json', orient='records', indent=2)
print(f"[3/3] f1_driver_stats.json → {len(stats)} vozača")
print("\nSvi podaci su generirani u mapi /podaci/")