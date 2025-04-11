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

    # If no likes and no interests, fallback to like_count
    if not user_likes and not user_interests:
        return [p['id'] for p in sorted(posts, key=lambda x: x['like_count'], reverse=True)[:5]]

    # Extract text
    def extract_text(data):
        return [f"{post.get('caption', '')} {post.get('location', '')}" for post in data]

    liked_texts = extract_text(user_likes)
    post_texts = extract_text(posts)

    # Initialize post_scores with a base value of 1 for each post
    # This ensures we can boost scores even when there are no likes
    post_scores = [1.0] * len(posts)

    # Add TF-IDF similarity scores if user has likes
    if liked_texts:
        vectorizer = TfidfVectorizer(stop_words='english')
        liked_vectors = vectorizer.fit_transform(liked_texts)
        post_vectors = vectorizer.transform(post_texts)
        similarity_scores = cosine_similarity(liked_vectors, post_vectors).mean(axis=0)
        
        # Add similarity scores to base scores
        for i in range(len(post_scores)):
            post_scores[i] += similarity_scores[i] * 2  # Weight similarity more

    # Zero-shot boosting with interests
    if user_interests:
        print(f"🎯 Boosting posts based on user interests: {user_interests}", file=sys.stderr)
        for i, post in enumerate(posts):
            try:
                caption = post.get("caption", "")
                if not caption:  # Skip posts without captions
                    continue
                    
                result = classifier(caption, candidate_labels=user_interests)
                top_label = result['labels'][0]
                top_score = result['scores'][0]
                
                # Log classification results to debug
                print(f"📊 Post {post.get('id')}: '{caption[:30]}...' - Label: {top_label}, Score: {top_score:.2f}", file=sys.stderr)
                
                if top_score > 0.5:  # If classification is confident enough
                    # Add a significant boost (3.0) instead of multiplying
                    post_scores[i] += 3.0 * top_score
                    print(f"✨ Boosted post {post.get('id')} for interest '{top_label}', new score: {post_scores[i]:.2f}", file=sys.stderr)
            except Exception as e:
                print(f"⚠️ Zero-shot error: {e}", file=sys.stderr)

    # Log all post scores before ranking
    for i, post in enumerate(posts):
        print(f"📈 Post {post.get('id')}: Score {post_scores[i]:.2f} - Caption: {post.get('caption', '')[:30]}", file=sys.stderr)

    ranked = sorted(zip(posts, post_scores), key=lambda x: x[1], reverse=True)
    recommendations = [post['id'] for post, score in ranked[:5]]
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
                print(f"🔍 [ML] Received user interests: {user_interests}", file=sys.stderr)
                recommendations = generate_recommendations(user_id, posts, user_likes, user_interests)
                sys.stdout.write(json.dumps(recommendations) + "\n")
                sys.stdout.flush()
            else:
                # Sending an empty response
                sys.stdout.write(json.dumps([]) + "\n")
                sys.stdout.flush()

        except Exception as e:
            print(f"❌ [ML] Error: {e}", file=sys.stderr)
            sys.stderr.flush()
            # Sending an empty response in case of error
            sys.stdout.write(json.dumps([]) + "\n")
            sys.stdout.flush()

if __name__ == "__main__":
    main()