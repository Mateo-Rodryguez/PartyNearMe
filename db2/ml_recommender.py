import sys
import json
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

# Set default encoding to UTF-8
sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

print("🚀 ML Recommender Started", file=sys.stderr)
sys.stderr.flush()

def generate_recommendations(user_id, posts, user_likes):
    print(f"🔄 [ML] Generating recommendations for user {user_id}...", file=sys.stderr)

    if not posts:
        print(f"⚠️ [ML] No posts available for recommendations.", file=sys.stderr)
        return []

    if not user_likes:
        print(f"⚠️ [ML] User {user_id} has no likes. Showing popular posts instead.", file=sys.stderr)
        return [post['id'] for post in sorted(posts, key=lambda x: x['like_count'], reverse=True)[:5]]

    # Combine captions and locations for vectorization
    def extract_text(data):
        return [f"{post['caption']} {post['location']}" for post in data]

    # Prepare data for TF-IDF
    liked_texts = extract_text(user_likes)
    post_texts = extract_text(posts)

    # Vectorize using TF-IDF
    vectorizer = TfidfVectorizer(stop_words='english')
    liked_vectors = vectorizer.fit_transform(liked_texts)
    post_vectors = vectorizer.transform(post_texts)

    # Calculate similarity scores
    similarity_scores = cosine_similarity(liked_vectors, post_vectors)

    # Rank posts based on highest similarity
    post_scores = similarity_scores.mean(axis=0)
    ranked_posts = sorted(zip(posts, post_scores), key=lambda x: x[1], reverse=True)

    # Select top 5 recommendations
    recommendations = [post['id'] for post, score in ranked_posts[:5]]

    print(f"✅ [ML] Recommendations for user {user_id}: {recommendations}", file=sys.stderr)
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
                recommendations = generate_recommendations(user_id, posts, user_likes)
                sys.stdout.write(json.dumps(recommendations) + "\n")
                sys.stdout.flush()

        except Exception as e:
            print(f"❌ [ML] Error: {e}", file=sys.stderr)
            sys.stderr.flush()

if __name__ == "__main__":
    main() 