import sys
import json
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from transformers import pipeline

# Initiating the zero shot classifier once
classifier = pipeline("zero-shot-classification", model="facebook/bart-large-mnli")
# Set default encoding to UTF-8
sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

print("🚀 ML Recommender Started", file=sys.stderr)
sys.stderr.flush()

def generate_recommendations(user_id, posts, user_likes, user_interests=None):
    print(f"🔄 [ML] Generating recommendations for user {user_id}...", file=sys.stderr)

    if not posts:
        return []

    if not user_likes:
        return [post['id'] for post in sorted(posts, key=lambda x: x['like_count'], reverse=True)[:5]]

    def extract_text(data):
        return [f"{post['caption']} {post['location']}" for post in data]

    liked_texts = extract_text(user_likes)
    post_texts = extract_text(posts)

    vectorizer = TfidfVectorizer(stop_words='english')
    liked_vectors = vectorizer.fit_transform(liked_texts)
    post_vectors = vectorizer.transform(post_texts)

    similarity_scores = cosine_similarity(liked_vectors, post_vectors)
    post_scores = similarity_scores.mean(axis=0)

    # Boost score for posts matching user's interests
    if user_interests:
        print(f"🎯 Boosting posts based on user interests: {user_interests}", file=sys.stderr)
        for i, post in enumerate(posts):
            try:
                caption = post.get("caption", "")
                result = classifier(caption, candidate_labels=user_interests)
                top_label = result['labels'][0]
                top_score = result['scores'][0]

                if top_label in user_interests and top_score > 0.5:
                    boost_factor = 1.15  # 15% boost
                    post_scores[i] *= boost_factor
                    print(f"✨ Boosted post '{caption[:30]}...' for interest '{top_label}'", file=sys.stderr)

            except Exception as e:
                print(f"⚠️ Error during zero-shot classification: {e}", file=sys.stderr)

    ranked_posts = sorted(zip(posts, post_scores), key=lambda x: x[1], reverse=True)
    recommendations = [post['id'] for post, score in ranked_posts[:5]]

    print(f"✅ [ML] Final recommendations: {recommendations}", file=sys.stderr)
    return recommendations

def main():
    print("🚀 [ML] Recommendation system running. Waiting for user input...", file=sys.stderr)
    sys.stderr.flush()

    while True:
        try:
            line = sys.stdin.readline()
            if not line:
                break  # Exit on EOF

            data = json.loads(line.strip())
            user_id = data.get("user_id")
            posts = data.get("posts", [])
            user_likes = data.get("user_likes", [])

            print(f"🔄 [ML] Received data for user {user_id}", file=sys.stderr)
            print(f"🔄 [ML] Posts: {posts}", file=sys.stderr)
            print(f"🔄 [ML] User Likes: {user_likes}", file=sys.stderr)

            if user_id and posts:
                user_interests = data.get("user_interests", [])
                recommendations = generate_recommendations(user_id, posts, user_likes)
                sys.stdout.write(json.dumps(recommendations) + "\n")
                sys.stdout.flush()

        except Exception as e:
            print(f"❌ [ML] Error: {e}", file=sys.stderr)
            sys.stderr.flush()

if __name__ == "__main__":
    main() 