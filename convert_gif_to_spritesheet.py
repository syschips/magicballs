#!/usr/bin/env python3
"""
GIF → PNG スプライトシート変換ツール

機能：
  1. 指定フォルダのGIFを全フレーム抽出
  2. フレームを1行に連結してPNG スプライトシートを生成
  3. フレーム位置情報をJSON メタデータとして出力

使用方法：
  python convert_gif_to_spritesheet.py [--input FOLDER] [--output FOLDER]

例：
  python convert_gif_to_spritesheet.py
  # デフォルト：../imgs/*.gif → ../imgs/*.png + ../data/spriteSheet.json 更新
"""

import sys
import json
import os
from pathlib import Path
from PIL import Image
import argparse

def extract_gif_frames(gif_path):
    """
    GIFから全フレームを抽出
    
    Returns:
        list of PIL.Image: フレーム画像のリスト
        dict: {duration: ms, ...}
    """
    frames = []
    durations = []
    
    try:
        gif = Image.open(gif_path)
    except Exception as e:
        print(f"  ❌ エラー: {gif_path} をオープンできません: {e}")
        return None, None
    
    # GIFの全フレームを抽出
    try:
        for frame_idx in range(gif.n_frames):
            gif.seek(frame_idx)
            
            # フレーム画像を取得（RGBA に統一）
            frame = gif.convert('RGBA')
            frames.append(frame)
            
            # フレームの表示時間を取得（ミリ秒）
            duration = gif.info.get('duration', 100)
            durations.append(duration)
    except EOFError:
        pass
    
    if not frames:
        print(f"  ⚠️  警告: {gif_path} からフレームを抽出できません")
        return None, None
    
    print(f"  ✓ {len(frames)} フレーム抽出")
    return frames, durations

def create_spritesheet(frames, output_path):
    """
    フレームをスプライトシートに合成（1行配置）
    
    Args:
        frames: list of PIL.Image
        output_path: 出力PNG パス
    
    Returns:
        list: フレーム位置情報 [{x, y, width, height}, ...]
    """
    if not frames:
        return None
    
    # フレームサイズは最初のフレームから取得
    frame_width, frame_height = frames[0].size
    cols = len(frames)
    
    # スプライトシートサイズを計算
    sheet_width = frame_width * cols
    sheet_height = frame_height
    
    # 背景が透明なスプライトシートを作成
    spritesheet = Image.new('RGBA', (sheet_width, sheet_height), (0, 0, 0, 0))
    
    # フレーム配置とメタデータ生成
    frame_data = []
    for idx, frame in enumerate(frames):
        x_pos = idx * frame_width
        spritesheet.paste(frame, (x_pos, 0), frame)
        
        frame_data.append({
            'x': x_pos,
            'y': 0,
            'width': frame_width,
            'height': frame_height
        })
    
    # PNG として保存
    try:
        spritesheet.save(output_path, 'PNG')
        print(f"  ✓ スプライトシート生成: {output_path}")
        print(f"    サイズ: {sheet_width}x{sheet_height} ({cols}フレーム)")
        return frame_data
    except Exception as e:
        print(f"  ❌ エラー: スプライトシート保存に失敗: {e}")
        return None

def convert_gif_files(input_dir, output_dir, metadata_path):
    """
    フォルダ内の全GIFをスプライトシート化
    """
    input_path = Path(input_dir)
    output_path = Path(output_dir)
    
    # 出力ディレクトリ作成
    output_path.mkdir(parents=True, exist_ok=True)
    
    # GIFファイルを検索
    gif_files = sorted(input_path.glob('*.gif'))
    
    if not gif_files:
        print(f"❌ {input_dir} に GIF ファイルが見つかりません")
        return False
    
    print(f"\n📦 GIF ファイル検出: {len(gif_files)} 個")
    
    # メタデータを読み込み（既存）
    metadata = {}
    if Path(metadata_path).exists():
        try:
            with open(metadata_path, 'r', encoding='utf-8') as f:
                metadata = json.load(f)
        except Exception as e:
            print(f"⚠️  警告: 既存メタデータが読み込めません: {e}")
            metadata = {}
    
    # 各GIFを処理
    success_count = 0
    for gif_file in gif_files:
        sprite_id = gif_file.stem  # ファイル名（拡張子なし）
        print(f"\n🔄 {sprite_id} を処理中...")
        
        # フレーム抽出
        frames, durations = extract_gif_frames(gif_file)
        if frames is None:
            continue
        
        # スプライトシート生成
        output_png = output_path / f"{sprite_id}.png"
        frame_data = create_spritesheet(frames, output_png)
        
        if frame_data is None:
            continue
        
        # メタデータ更新
        if durations:
            avg_duration = sum(durations) / len(durations)
            frame_duration_sec = avg_duration / 1000.0  # ミリ秒→秒
        else:
            frame_duration_sec = 0.1  # デフォルト
        
        metadata[sprite_id] = {
            'type': 'spritesheet',
            'width': frames[0].width,
            'height': frames[0].height,
            'frameCount': len(frames),
            'frameWidth': frames[0].width,
            'frameHeight': frames[0].height,
            'frameDuration': frame_duration_sec,
            'frameData': frame_data
        }
        
        success_count += 1
    
    if success_count == 0:
        print("\n❌ 変換に成功したファイルがありません")
        return False
    
    # メタデータを保存
    try:
        with open(metadata_path, 'w', encoding='utf-8') as f:
            json.dump(metadata, f, indent=2, ensure_ascii=False)
        print(f"\n✅ メタデータ保存: {metadata_path}")
    except Exception as e:
        print(f"\n❌ エラー: メタデータ保存に失敗: {e}")
        return False
    
    print(f"\n✅ 変換完了: {success_count}/{len(gif_files)} ファイル")
    return True

def main():
    # 引数パース
    parser = argparse.ArgumentParser(
        description='GIF → PNG スプライトシート変換ツール'
    )
    parser.add_argument(
        '--input',
        default='./imgs',
        help='入力GIFフォルダ（デフォルト: ./imgs）'
    )
    parser.add_argument(
        '--output',
        default='./imgs',
        help='出力PNGフォルダ（デフォルト: ./imgs）'
    )
    parser.add_argument(
        '--metadata',
        default='./data/spriteSheet.json',
        help='メタデータ出力パス（デフォルト: ./data/spriteSheet.json）'
    )
    
    args = parser.parse_args()
    
    print("=" * 60)
    print("🎬 GIF → PNG スプライトシート変換ツール")
    print("=" * 60)
    print(f"入力フォルダ: {args.input}")
    print(f"出力フォルダ: {args.output}")
    print(f"メタデータ: {args.metadata}")
    print("=" * 60)
    
    # PILの依存確認
    try:
        from PIL import Image
    except ImportError:
        print("\n❌ エラー: PIL/Pillow がインストールされていません")
        print("以下のコマンドでインストールしてください:")
        print("  pip install Pillow")
        sys.exit(1)
    
    # 変換実行
    success = convert_gif_files(args.input, args.output, args.metadata)
    
    if success:
        print("\n" + "=" * 60)
        print("✅ 処理完了！")
        print("\n次のステップ：")
        print("1. PNG スプライトシートと HTML に期待どおりに表示されるか確認")
        print("2. 問題があれば、別のGIFから試しながら調整")
        print("3. アニメーション周期が合わない場合は、frameDuration を調整")
        print("=" * 60)
        sys.exit(0)
    else:
        print("\n" + "=" * 60)
        print("❌ エラーが発生しました")
        print("=" * 60)
        sys.exit(1)

if __name__ == '__main__':
    main()
