-- 游船数量改为 12 艘（黄浦江 10、苏州河 2），删掉多余的船位
DELETE FROM boat_reports WHERE boat_id >= 12;
DELETE FROM boats WHERE id >= 12;
