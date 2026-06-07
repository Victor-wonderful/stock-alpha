-- 로컬 개발 시드 — 대표 종목 마스터 (전체 시드는 engine/ingest 가 채움)
insert into instruments (symbol, exchange, name, sector, asset_type, currency) values
  ('005930', 'KRX', '삼성전자',        'IT',          'stock', 'KRW'),
  ('000660', 'KRX', 'SK하이닉스',      'IT',          'stock', 'KRW'),
  ('373220', 'KRX', 'LG에너지솔루션',  '2차전지',     'stock', 'KRW'),
  ('207940', 'KRX', '삼성바이오로직스','바이오',      'stock', 'KRW'),
  ('035420', 'KRX', 'NAVER',           '인터넷',      'stock', 'KRW'),
  ('AAPL',   'NASDAQ', 'Apple',        'Technology',  'stock', 'USD'),
  ('MSFT',   'NASDAQ', 'Microsoft',    'Technology',  'stock', 'USD'),
  ('NVDA',   'NASDAQ', 'NVIDIA',       'Semiconductors','stock','USD'),
  ('TSLA',   'NASDAQ', 'Tesla',        'Automotive',  'stock', 'USD'),
  ('SPY',    'NYSE',   'SPDR S&P 500 ETF', 'Index',   'etf',   'USD')
on conflict (symbol, exchange) do nothing;
